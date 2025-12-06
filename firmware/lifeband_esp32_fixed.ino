/************************************************************
   LIFEBAND ESP32-S3 - FIXED FIRMWARE WITH SERIAL MONITORING
*************************************************************/

#include <NimBLEDevice.h>
#include <ArduinoJson.h>
#include <base64.h>
#include <Wire.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"
#include <Adafruit_NeoPixel.h>

#define RGB_PIN 48
Adafruit_NeoPixel rgb(1, RGB_PIN, NEO_GRB + NEO_KHZ800);

static const char* DEVICE_NAME = "LIFEBAND-S3";
static const NimBLEUUID SERVICE_UUID("c0de0001-73f3-4b4c-8f61-1aa7a6d5beef");
static const NimBLEUUID VITALS_CHAR_UUID("c0de0002-73f3-4b4c-8f61-1aa7a6d5beef");
static const NimBLEUUID CONFIG_CHAR_UUID("c0de0003-73f3-4b4c-8f61-1aa7a6d5beef");

NimBLEServer* bleServer = nullptr;
NimBLECharacteristic* vitalsChar = nullptr;
bool deviceConnected = false;
bool notifyEnabled = false;

unsigned long lastSend = 0;
const unsigned long SEND_INTERVAL_MS = 1000;

#define ECG_PIN 4

MAX30105 maxSensor;
bool sensorReady = false;

uint32_t irBuffer[100];
uint32_t redBuffer[100];
int32_t spo2Value = 0;
int8_t validSPO2 = 0;
int32_t heartRateValue = 0;
int8_t validHeartRate = 0;

unsigned long lastECGPeak = 0;
unsigned long lastPPGPeak = 0;
unsigned long lastHeartBeat = 0;
float ptt_ms = 0;
int hrv_ms = 0;

bool ecgPeakDetected = false;
int ecgThreshold = 600;  // Adjusted for AD8232 (typical range 0-1023 for 3.3V ADC)
int ecgBaseline = 512;   // Baseline for AD8232 output

float bp_sys = 120;
float bp_dia = 80;

// ECG waveform analysis for BP estimation
int ecgPeakAmplitude = 0;     // R-peak amplitude
int ecgQRSWidth = 0;          // QRS complex width
int lastValidHR = 75;         // Last valid heart rate for BP calc
float hrvRatio = 1.0;         // HRV ratio for BP adjustment

const int AVG_SAMPLES = 5;
int hrHistory[AVG_SAMPLES] = {0};
int spo2History[AVG_SAMPLES] = {0};
int rrIntervals[AVG_SAMPLES] = {0};  // R-R intervals for HRV
int historyIndex = 0;

// Initialize with baseline values
int currentHR = 0;       // Start at 0, will update from ECG
int currentSPO2 = 0;     // Start at 0, will update from MAX30105
int ecgHeartRate = 0;    // Heart rate calculated from ECG R-peaks

void rgbColor(uint8_t r, uint8_t g, uint8_t b) {
  rgb.setPixelColor(0, rgb.Color(r, g, b));
  rgb.show();
}

void rgbBlink(uint8_t r, uint8_t g, uint8_t b, int times, int delayMs) {
  for (int i = 0; i < times; i++) {
    rgbColor(r, g, b);
    delay(delayMs);
    rgbColor(0, 0, 0);
    delay(delayMs);
  }
}

bool detectECGPeak(int ecgValue) {
  static bool peakFound = false;
  static int lastEcg = 0;
  static int maxPeak = 0;
  static unsigned long lastPeakTime = 0;
  static unsigned long peakStartTime = 0;
  
  // Detect rising edge crossing threshold
  if (ecgValue > ecgThreshold && lastEcg <= ecgThreshold && !peakFound) {
    peakFound = true;
    maxPeak = ecgValue;
    peakStartTime = millis();
  }
  
  // Track maximum during peak
  if (peakFound && ecgValue > maxPeak) {
    maxPeak = ecgValue;
  }
  
  // Detect falling edge - R-peak detected
  if (peakFound && ecgValue < ecgThreshold - 100) {
    peakFound = false;
    unsigned long now = millis();
    
    // Calculate QRS width (time from peak start to peak end)
    ecgQRSWidth = now - peakStartTime;
    ecgPeakAmplitude = maxPeak - ecgBaseline;
    
    // Ignore too-fast peaks (noise rejection - minimum 300ms between beats = 200 BPM max)
    if (now - lastPeakTime > 300) {
      // Calculate R-R interval
      if (lastHeartBeat > 0) {
        int rrInterval = now - lastHeartBeat;
        hrv_ms = rrInterval;
        
        // Store R-R interval for HRV calculation
        rrIntervals[historyIndex % AVG_SAMPLES] = rrInterval;
        
        // Calculate instantaneous heart rate from R-R interval
        ecgHeartRate = 60000 / rrInterval;  // Convert ms to BPM
        
        // Validate heart rate range
        if (ecgHeartRate >= 40 && ecgHeartRate <= 200) {
          hrHistory[historyIndex % AVG_SAMPLES] = ecgHeartRate;
          currentHR = getAverageHR();  // Update with moving average
          lastValidHR = currentHR;
          
          // Calculate BP from ECG features
          calculateBPFromECG();
        }
      }
      
      lastHeartBeat = now;
      lastECGPeak = now;
      lastPeakTime = now;
      
      lastEcg = ecgValue;
      return true;
    }
  }
  
  lastEcg = ecgValue;
  return false;
}

bool detectPPGPeak(long irValue) {
  static long lastIR = 0;
  static long peakIR = 0;
  static bool rising = false;
  
  if (irValue > lastIR + 500) {
    rising = true;
    if (irValue > peakIR) {
      peakIR = irValue;
    }
  }
  
  if (rising && irValue < lastIR - 500) {
    rising = false;
    lastPPGPeak = millis();
    peakIR = 0;
    lastIR = irValue;
    return true;
  }
  
  lastIR = irValue;
  return false;
}

void computePTTandBP() {
  // Blood Pressure estimation from PTT (Pulse Transit Time)
  // PTT = time between ECG R-peak and PPG peak at finger
  // Shorter PTT = higher BP (stiffer arteries)
  
  if (lastECGPeak > 0 && lastPPGPeak > lastECGPeak) {
    unsigned long currentPTT = lastPPGPeak - lastECGPeak;
    
    // Validate PTT range (typical: 150-350ms for arm-to-finger)
    if (currentPTT >= 150 && currentPTT <= 400) {
      ptt_ms = currentPTT;
      
      // Empirical BP estimation formulas (calibrated for typical adult)
      // These are approximations - actual calibration needed per person
      bp_sys = 180.0 - (ptt_ms * 0.25);   // Systolic decreases with longer PTT
      bp_dia = 110.0 - (ptt_ms * 0.15);   // Diastolic decreases with longer PTT
      
      // Clamp to physiological ranges
      if (bp_sys < 90) bp_sys = 90;
      if (bp_sys > 180) bp_sys = 180;
      if (bp_dia < 60) bp_dia = 60;
      if (bp_dia > 120) bp_dia = 120;
      
      // Ensure diastolic is always lower than systolic
      if (bp_dia >= bp_sys - 20) {
        bp_dia = bp_sys - 25;
      }
      
      Serial.print("[BP-PTT] PTT: ");
      Serial.print(ptt_ms);
      Serial.print("ms -> BP: ");
      Serial.print((int)bp_sys);
      Serial.print("/");
      Serial.println((int)bp_dia);
    }
  }
}

void calculateBPFromECG() {
  // Advanced BP estimation from ECG-only parameters
  // Uses: Heart Rate, HRV, R-peak amplitude, QRS width
  
  if (currentHR == 0) return;  // Need valid HR
  
  // Calculate HRV ratio (variability indicator)
  int hrvSDNN = calculateHRV();
  if (hrv_ms > 0) {
    hrvRatio = (float)hrvSDNN / (float)hrv_ms;
  }
  
  // === SYSTOLIC BP ESTIMATION ===
  // Based on multiple ECG features
  
  // 1. Heart Rate component (higher HR = higher systolic)
  //    Normal resting HR: 60-100 BPM
  //    Each 10 BPM increase above 70 adds ~5 mmHg
  float hrComponent = 100.0 + ((currentHR - 70) * 0.5);
  
  // 2. R-peak amplitude (higher amplitude = stronger contraction = higher BP)
  //    Normalize to typical range (200-600 for AD8232)
  float amplitudeComponent = (ecgPeakAmplitude - 200) * 0.08;
  
  // 3. QRS width (wider QRS may indicate cardiac stress)
  //    Normal QRS: 60-100ms, wider = potential hypertension
  float qrsComponent = 0;
  if (ecgQRSWidth > 100) {
    qrsComponent = (ecgQRSWidth - 100) * 0.3;
  }
  
  // 4. HRV component (lower HRV = higher sympathetic tone = higher BP)
  //    Higher variability = better cardiovascular health = lower BP
  float hrvComponent = -1.0 * (hrvSDNN * 0.1);
  
  // Combine components for systolic estimate
  bp_sys = hrComponent + amplitudeComponent + qrsComponent + hrvComponent;
  
  // === DIASTOLIC BP ESTIMATION ===
  // Diastolic correlates with resting state and vascular resistance
  
  // 1. Base diastolic from HR (slower HR = lower diastolic)
  float diastolicBase = 60.0 + ((currentHR - 70) * 0.3);
  
  // 2. HRV influence (good HRV = lower diastolic)
  float diastolicHRV = -1.0 * (hrvSDNN * 0.05);
  
  // 3. R-R interval influence (longer intervals = lower diastolic)
  float rrComponent = 0;
  if (hrv_ms > 800) {  // Longer than 800ms (< 75 BPM)
    rrComponent = -1.0 * ((hrv_ms - 800) * 0.01);
  } else if (hrv_ms < 600) {  // Shorter than 600ms (> 100 BPM)
    rrComponent = (600 - hrv_ms) * 0.02;
  }
  
  bp_dia = diastolicBase + diastolicHRV + rrComponent;
  
  // === VALIDATION AND CLAMPING ===
  
  // Physiological range limits
  if (bp_sys < 90) bp_sys = 90;
  if (bp_sys > 180) bp_sys = 180;
  if (bp_dia < 60) bp_dia = 60;
  if (bp_dia > 120) bp_dia = 120;
  
  // Ensure valid systolic/diastolic relationship
  // Diastolic must be at least 25 mmHg lower than systolic
  if (bp_dia >= bp_sys - 25) {
    bp_dia = bp_sys - 30;
  }
  
  // Typical pulse pressure is 40-60 mmHg
  float pulsePressure = bp_sys - bp_dia;
  if (pulsePressure < 30) {
    bp_dia = bp_sys - 35;
  } else if (pulsePressure > 70) {
    bp_dia = bp_sys - 60;
  }
  
  Serial.print("[BP-ECG] HR:");
  Serial.print(currentHR);
  Serial.print(" Amp:");
  Serial.print(ecgPeakAmplitude);
  Serial.print(" QRS:");
  Serial.print(ecgQRSWidth);
  Serial.print("ms HRV:");
  Serial.print(hrvSDNN);
  Serial.print(" -> BP:");
  Serial.print((int)bp_sys);
  Serial.print("/");
  Serial.println((int)bp_dia);
}

void updateSpO2andHR() {
  if (!sensorReady) {
    Serial.println("[SENSOR] Skipping update - sensor not ready");
    return;
  }
  
  Serial.println("[SENSOR] Reading MAX30102...");
  
  for (byte i = 0; i < 100; i++) {
    while (maxSensor.available() == false) {
      maxSensor.check();
    }
    
    redBuffer[i] = maxSensor.getRed();
    irBuffer[i] = maxSensor.getIR();
    maxSensor.nextSample();
  }
  
  maxim_heart_rate_and_oxygen_saturation(
    irBuffer, 100,
    redBuffer,
    &spo2Value, &validSPO2,
    &heartRateValue, &validHeartRate
  );
  
  if (validHeartRate && heartRateValue > 40 && heartRateValue < 200) {
    hrHistory[historyIndex] = heartRateValue;
    Serial.print("[SENSOR] Valid HR detected: ");
    Serial.println(heartRateValue);
  }
  
  if (validSPO2 && spo2Value > 70 && spo2Value <= 100) {
    spo2History[historyIndex] = spo2Value;
    Serial.print("[SENSOR] Valid SpO2 detected: ");
    Serial.println(spo2Value);
  }
  
  historyIndex = (historyIndex + 1) % AVG_SAMPLES;
  
  // Update current values
  int avgHR = getAverageHR();
  int avgSPO2 = getAverageSPO2();
  
  if (avgHR > 0) currentHR = avgHR;
  if (avgSPO2 > 0) currentSPO2 = avgSPO2;
  
  Serial.print("[SENSOR] Current HR: ");
  Serial.print(currentHR);
  Serial.print(", SpO2: ");
  Serial.println(currentSPO2);
}

int getAverageHR() {
  int sum = 0;
  int count = 0;
  for (int i = 0; i < AVG_SAMPLES; i++) {
    if (hrHistory[i] > 0) {
      sum += hrHistory[i];
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

int getAverageSPO2() {
  int sum = 0;
  int count = 0;
  for (int i = 0; i < AVG_SAMPLES; i++) {
    if (spo2History[i] > 0) {
      sum += spo2History[i];
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

int calculateHRV() {
  // Calculate SDNN (Standard Deviation of R-R intervals)
  // This is a measure of heart rate variability
  int validCount = 0;
  long sum = 0;
  
  // Calculate mean
  for (int i = 0; i < AVG_SAMPLES; i++) {
    if (rrIntervals[i] > 0) {
      sum += rrIntervals[i];
      validCount++;
    }
  }
  
  if (validCount < 2) return 0;  // Need at least 2 values
  
  long mean = sum / validCount;
  
  // Calculate variance
  long variance = 0;
  for (int i = 0; i < AVG_SAMPLES; i++) {
    if (rrIntervals[i] > 0) {
      long diff = rrIntervals[i] - mean;
      variance += (diff * diff);
    }
  }
  variance = variance / validCount;
  
  // Return standard deviation (approximation)
  return (int)sqrt(variance);
}

void sendVitals() {
  // Read raw sensor values
  int ecgRaw = analogRead(ECG_PIN);
  long irRaw = sensorReady ? maxSensor.getIR() : 0;
  long redRaw = sensorReady ? maxSensor.getRed() : 0;
  
  // Calculate HRV metrics
  int hrvSDNN = calculateHRV();  // Standard deviation of R-R intervals
  
  // Build JSON payload
  StaticJsonDocument<512> doc;
  
  doc["hr"] = currentHR;              // From ECG R-R intervals
  doc["spo2"] = currentSPO2;          // From MAX30105 algorithm
  doc["bp_sys"] = (int)bp_sys;        // From PTT calculation
  doc["bp_dia"] = (int)bp_dia;        // From PTT calculation
  doc["hrv"] = hrv_ms;                // Latest R-R interval
  doc["hrv_sdnn"] = hrvSDNN;          // HRV variability metric
  doc["ptt"] = (int)ptt_ms;           // Pulse Transit Time
  doc["ecg"] = ecgRaw;                // Raw ECG signal (0-4095)
  doc["ir"] = (int)irRaw;             // MAX30105 IR value
  doc["red"] = (int)redRaw;           // MAX30105 Red value
  doc["timestamp"] = millis();
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("========================================");
  Serial.print("[VITALS] ");
  Serial.println(jsonString);
  
  // Send notification - SEND RAW JSON
  if (vitalsChar && deviceConnected) {
    vitalsChar->setValue(jsonString.c_str());
    vitalsChar->notify();
    Serial.print("[BLE] Sent (");
    Serial.print(jsonString.length());
    Serial.println(" bytes)");
  }
  
  Serial.println("========================================\n");
}

class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* pServer, ble_gap_conn_desc* desc) {
    deviceConnected = true;
    Serial.println("\n========================================");
    Serial.println("[BLE] ✓✓✓ CONNECTED ✓✓✓");
    Serial.print("[BLE] Peer address: ");
    Serial.println(NimBLEAddress(desc->peer_ota_addr).toString().c_str());
    Serial.println("========================================\n");
    rgbColor(0, 255, 0);
  }
  
  void onDisconnect(NimBLEServer* pServer) {
    deviceConnected = false;
    Serial.println("\n========================================");
    Serial.println("[BLE] DISCONNECTED");
    Serial.println("========================================\n");
    rgbColor(255, 0, 0);
    delay(100);
    NimBLEDevice::startAdvertising();
    Serial.println("[BLE] Advertising restarted");
  }
};

class VitalsCallbacks : public NimBLECharacteristicCallbacks {
  void onSubscribe(NimBLECharacteristic* pCharacteristic, ble_gap_conn_desc* desc, uint16_t subValue) {
    if (subValue > 0) {
      Serial.println("[BLE] Notifications ON");
    }
  }
};

class ConfigCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* pCharacteristic) {
    Serial.println("[CONFIG] Command received");
  }
};

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n\n");
  Serial.println("========================================");
  Serial.println("   LIFEBAND ESP32-S3 v3.0 SENSOR");
  Serial.println("   AD8232: ECG, HR, BP");
  Serial.println("   MAX30105: SpO2, PPG");
  Serial.println("========================================");
  
  rgb.begin();
  rgb.setBrightness(50);
  rgbColor(255, 255, 0);
  
  pinMode(ECG_PIN, INPUT);
  Serial.println("[ECG] AD8232 initialized on GPIO4");
  
  Serial.println("[SENSOR] Initializing MAX30105...");
  Wire.begin(11, 12);
  
  if (maxSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("[MAX30105] ✓ Sensor found!");
    
    // Configure for SpO2 mode
    maxSensor.setup(0x1F, 4, 2, 100, 411, 4096);  // Lower LED power for better readings
    maxSensor.setPulseAmplitudeRed(0x0A);
    maxSensor.setPulseAmplitudeIR(0x0A);
    
    sensorReady = true;
    Serial.println("[MAX30105] ✓ Configured for SpO2 measurement");
    Serial.println("[MAX30105] Place finger gently on sensor");
  } else {
    Serial.println("[MAX30105] ✗ NOT FOUND");
    Serial.println("[MAX30105] Check: SDA=GPIO11, SCL=GPIO12");
    Serial.println("[MAX30105] SpO2 will show 0 without sensor");
    sensorReady = false;
  }
  
  Serial.println("[BLE] Initializing BLE stack...");
  NimBLEDevice::init(DEVICE_NAME);
  NimBLEDevice::setPower(ESP_PWR_LVL_P9);
  NimBLEDevice::setMTU(512);
  
  bleServer = NimBLEDevice::createServer();
  bleServer->setCallbacks(new ServerCallbacks());
  
  NimBLEService* pService = bleServer->createService(SERVICE_UUID);
  
  vitalsChar = pService->createCharacteristic(
    VITALS_CHAR_UUID,
    NIMBLE_PROPERTY::NOTIFY
  );
  vitalsChar->setCallbacks(new VitalsCallbacks());
  
  NimBLECharacteristic* configChar = pService->createCharacteristic(
    CONFIG_CHAR_UUID,
    NIMBLE_PROPERTY::WRITE
  );
  configChar->setCallbacks(new ConfigCallbacks());
  
  pService->start();
  
  NimBLEAdvertising* pAdvertising = NimBLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->start();
  
  Serial.println("[BLE] ✓ Service started");
  Serial.println("[BLE] ✓ Advertising as: LIFEBAND-S3");
  Serial.print("[BLE] Service UUID: ");
  Serial.println(SERVICE_UUID.toString().c_str());
  Serial.print("[BLE] Vitals UUID: ");
  Serial.println(VITALS_CHAR_UUID.toString().c_str());
  
  Serial.println("\n========================================");
  Serial.println("   ✓✓✓ SYSTEM READY ✓✓✓");
  Serial.println("   Waiting for connection...");
  Serial.println("========================================\n");
  
  rgbColor(0, 0, 255);
  delay(500);
  rgbColor(0, 0, 0);
}

void loop() {
  unsigned long now = millis();
  
  // Check actual connection state from server
  static bool wasConnected = false;
  int connCount = bleServer->getConnectedCount();
  bool isConnected = (connCount > 0);
  
  // Detect connection state changes
  if (isConnected != wasConnected) {
    if (isConnected) {
      deviceConnected = true;
      Serial.println("\n========================================");
      Serial.println("[BLE] ✓✓✓ CONNECTION DETECTED ✓✓✓");
      Serial.print("[BLE] Connected devices: ");
      Serial.println(connCount);
      Serial.println("========================================\n");
      rgbColor(0, 255, 0);
    } else {
      deviceConnected = false;
      Serial.println("[BLE] Connection lost");
      rgbColor(255, 0, 0);
    }
    wasConnected = isConnected;
  }
  
  // Read sensors continuously (non-blocking, quick reads)
  if (sensorReady) {
    // Quick MAX30102 sample read (non-blocking)
    static int sampleCount = 0;
    static unsigned long lastSensorRead = 0;
    
    // Read one sample at a time to avoid blocking
    if (maxSensor.available()) {
      uint32_t red = maxSensor.getRed();
      uint32_t ir = maxSensor.getIR();
      
      // Store in circular buffer
      redBuffer[sampleCount % 100] = red;
      irBuffer[sampleCount % 100] = ir;
      
      // Detect PPG peak for PTT calculation
      if (detectPPGPeak(ir)) {
        computePTTandBP();
      }
      
      maxSensor.nextSample();
      sampleCount++;
      
      // Process HR/SpO2 every 100 samples (every ~4 seconds at 25Hz)
      if (sampleCount % 100 == 0 && sampleCount > 0) {
        maxim_heart_rate_and_oxygen_saturation(
          irBuffer, 100,
          redBuffer,
          &spo2Value, &validSPO2,
          &heartRateValue, &validHeartRate
        );
        
        // Update history with valid readings
        if (validHeartRate && heartRateValue > 40 && heartRateValue < 200) {
          spo2History[historyIndex] = spo2Value;  // Store with same index
          
          // Only update SpO2, keep HR from ECG
          int avgSPO2 = getAverageSPO2();
          if (avgSPO2 > 0) {
            currentSPO2 = avgSPO2;
            Serial.print("[MAX30105] SpO2: ");
            Serial.print(currentSPO2);
            Serial.println("%");
          }
        }
        
        if (validSPO2 && spo2Value > 70 && spo2Value <= 100) {
          // Update SpO2 independently
          spo2History[historyIndex] = spo2Value;
          int avgSPO2 = getAverageSPO2();
          if (avgSPO2 > 0) {
            currentSPO2 = avgSPO2;
          }
        }
        
        historyIndex = (historyIndex + 1) % AVG_SAMPLES;
      }
    } else {
      // Check for new samples if none available
      maxSensor.check();
    }
  }
  
  // Read ECG continuously for peak detection and heart rate
  int ecgRaw = analogRead(ECG_PIN);
  if (detectECGPeak(ecgRaw)) {
    // ECG R-peak detected
    Serial.print("[ECG] R-peak! HR: ");
    Serial.print(currentHR);
    Serial.print(" BPM, HRV: ");
    Serial.print(hrv_ms);
    Serial.println("ms");
  }
  
  // Send vitals every 1 second when connected
  if (deviceConnected && (now - lastSend >= SEND_INTERVAL_MS)) {
    lastSend = now;
    sendVitals();
  }
  
  delay(10);  // Small delay to prevent watchdog issues
}
