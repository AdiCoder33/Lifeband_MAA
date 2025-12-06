/************************************************************
   LIFEBAND ESP32-S3 - WORKING FIRMWARE
   - Sends vitals every 2 seconds via BLE
   - Green LED when connected, Red when disconnected
   - Auto-reconnect on disconnect
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
bool wasConnected = false;

unsigned long lastSend = 0;
const unsigned long SEND_INTERVAL_MS = 2000;  // 2 seconds

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

int ecgThreshold = 600;
int ecgBaseline = 512;

float bp_sys = 120;
float bp_dia = 80;
float bp_sys_ecg = 120;
float bp_dia_ecg = 80;
float bp_sys_ptt = 120;
float bp_dia_ptt = 80;
String bpMethodUsed = "ECG";

int ecgPeakAmplitude = 0;
int ecgQRSWidth = 0;
int lastValidHR = 75;

const int AVG_SAMPLES = 5;
int hrHistory[AVG_SAMPLES] = {0};
int spo2History[AVG_SAMPLES] = {0};
int rrIntervals[AVG_SAMPLES] = {0};
int historyIndex = 0;

int currentHR = 0;
int currentSPO2 = 0;
int ecgHeartRate = 0;
int ppgHeartRate = 0;
float ecgReliability = 0.0;
float ppgReliability = 0.0;
String reliableSource = "NONE";

String rhythmType = "Normal";
float rhythmConfidence = 0.0;
bool arrhythmiaAlert = false;
int rrIntervalVariance = 0;

String anemiaRisk = "Low";
float anemiaConfidence = 0.0;
bool anemiaAlert = false;

String preeclampsiaRisk = "Low";
float preeclampsiaConfidence = 0.0;
bool preeclampsiaAlert = false;

int maternalHealthScore = 100;
unsigned long lastPregnancyCheck = 0;

void setConnectionLED(bool connected) {
  if (connected) {
    rgb.setPixelColor(0, rgb.Color(0, 255, 0));  // Green
  } else {
    rgb.setPixelColor(0, rgb.Color(255, 0, 0));  // Red
  }
  rgb.show();
}

void rgbColor(uint8_t r, uint8_t g, uint8_t b) {
  rgb.setPixelColor(0, rgb.Color(r, g, b));
  rgb.show();
}

bool detectECGPeak(int ecgValue) {
  static bool peakFound = false;
  static int lastEcg = 0;
  static int maxPeak = 0;
  static unsigned long lastPeakTime = 0;
  static unsigned long peakStartTime = 0;
  
  if (ecgValue > ecgThreshold && lastEcg <= ecgThreshold && !peakFound) {
    peakFound = true;
    maxPeak = ecgValue;
    peakStartTime = millis();
  }
  
  if (peakFound && ecgValue > maxPeak) {
    maxPeak = ecgValue;
  }
  
  if (peakFound && ecgValue < ecgThreshold - 100) {
    peakFound = false;
    unsigned long now = millis();
    
    ecgQRSWidth = now - peakStartTime;
    ecgPeakAmplitude = maxPeak - ecgBaseline;
    
    if (now - lastPeakTime > 300) {
      if (lastHeartBeat > 0) {
        int rrInterval = now - lastHeartBeat;
        hrv_ms = rrInterval;
        rrIntervals[historyIndex % AVG_SAMPLES] = rrInterval;
        ecgHeartRate = 60000 / rrInterval;
        
        if (ecgHeartRate >= 40 && ecgHeartRate <= 200) {
          hrHistory[historyIndex % AVG_SAMPLES] = ecgHeartRate;
          currentHR = getAverageHR();
          lastValidHR = currentHR;
          calculateBPFromECG();
          classifyCardiacRhythm();
          
          if (millis() - lastPregnancyCheck > 5000) {
            detectAnemia();
            detectPreeclampsia();
            calculateMaternalHealthScore();
            lastPregnancyCheck = millis();
          }
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
    if (irValue > peakIR) peakIR = irValue;
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
  if (lastECGPeak > 0 && lastPPGPeak > lastECGPeak) {
    unsigned long currentPTT = lastPPGPeak - lastECGPeak;
    if (currentPTT >= 150 && currentPTT <= 400) {
      ptt_ms = currentPTT;
      bp_sys_ptt = 180.0 - (ptt_ms * 0.25);
      bp_dia_ptt = 110.0 - (ptt_ms * 0.15);
      
      if (bp_sys_ptt < 90) bp_sys_ptt = 90;
      if (bp_sys_ptt > 180) bp_sys_ptt = 180;
      if (bp_dia_ptt < 60) bp_dia_ptt = 60;
      if (bp_dia_ptt > 120) bp_dia_ptt = 120;
      if (bp_dia_ptt >= bp_sys_ptt - 20) bp_dia_ptt = bp_sys_ptt - 25;
    }
  }
}

void calculateBPFromECG() {
  if (currentHR == 0) return;
  
  int hrvSDNN = calculateHRV();
  float hrComponent = 100.0 + ((currentHR - 70) * 0.5);
  float amplitudeComponent = (ecgPeakAmplitude - 200) * 0.08;
  float qrsComponent = (ecgQRSWidth > 100) ? (ecgQRSWidth - 100) * 0.3 : 0;
  float hrvComponent = -1.0 * (hrvSDNN * 0.1);
  
  bp_sys_ecg = hrComponent + amplitudeComponent + qrsComponent + hrvComponent;
  
  float diastolicBase = 60.0 + ((currentHR - 70) * 0.3);
  float diastolicHRV = -1.0 * (hrvSDNN * 0.05);
  float rrComponent = 0;
  if (hrv_ms > 800) {
    rrComponent = -1.0 * ((hrv_ms - 800) * 0.01);
  } else if (hrv_ms < 600) {
    rrComponent = (600 - hrv_ms) * 0.02;
  }
  
  bp_dia_ecg = diastolicBase + diastolicHRV + rrComponent;
  
  if (bp_sys_ecg < 90) bp_sys_ecg = 90;
  if (bp_sys_ecg > 180) bp_sys_ecg = 180;
  if (bp_dia_ecg < 60) bp_dia_ecg = 60;
  if (bp_dia_ecg > 120) bp_dia_ecg = 120;
  if (bp_dia_ecg >= bp_sys_ecg - 25) bp_dia_ecg = bp_sys_ecg - 30;
  
  float pulsePressure = bp_sys_ecg - bp_dia_ecg;
  if (pulsePressure < 30) bp_dia_ecg = bp_sys_ecg - 35;
  else if (pulsePressure > 70) bp_dia_ecg = bp_sys_ecg - 60;
}

int getAverageHR() {
  int sum = 0, count = 0;
  for (int i = 0; i < AVG_SAMPLES; i++) {
    if (hrHistory[i] > 0) {
      sum += hrHistory[i];
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

int getAverageSPO2() {
  int sum = 0, count = 0;
  for (int i = 0; i < AVG_SAMPLES; i++) {
    if (spo2History[i] > 0) {
      sum += spo2History[i];
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

void calculateECGReliability() {
  float score = 0.0;
  if (ecgPeakAmplitude >= 200 && ecgPeakAmplitude <= 800) score += 40.0;
  else if (ecgPeakAmplitude >= 100 && ecgPeakAmplitude <= 1000) score += 25.0;
  else if (ecgPeakAmplitude > 0) score += 10.0;
  
  if (ecgQRSWidth >= 60 && ecgQRSWidth <= 120) score += 20.0;
  else if (ecgQRSWidth > 40 && ecgQRSWidth <= 150) score += 10.0;
  
  if (ecgHeartRate >= 50 && ecgHeartRate <= 150) score += 20.0;
  else if (ecgHeartRate >= 40 && ecgHeartRate <= 200) score += 10.0;
  
  int hrvSDNN = calculateHRV();
  if (hrvSDNN > 0 && hrvSDNN < 100) score += 20.0;
  else if (hrvSDNN >= 100 && hrvSDNN < 200) score += 10.0;
  
  ecgReliability = score;
}

void calculatePPGReliability() {
  float score = 0.0;
  long irValue = sensorReady ? maxSensor.getIR() : 0;
  if (irValue >= 50000 && irValue <= 200000) score += 30.0;
  else if (irValue >= 20000 && irValue <= 250000) score += 15.0;
  else if (irValue > 10000) score += 5.0;
  
  long redValue = sensorReady ? maxSensor.getRed() : 0;
  if (redValue >= 30000 && redValue <= 150000) score += 20.0;
  else if (redValue >= 10000 && redValue <= 200000) score += 10.0;
  
  if (validHeartRate) score += 15.0;
  if (validSPO2) score += 15.0;
  
  if (ppgHeartRate >= 50 && ppgHeartRate <= 150) score += 20.0;
  else if (ppgHeartRate >= 40 && ppgHeartRate <= 200) score += 10.0;
  
  ppgReliability = score;
}

void selectReliableHeartRate() {
  calculateECGReliability();
  calculatePPGReliability();
  
  if (ecgReliability > ppgReliability && ecgHeartRate > 0) {
    reliableSource = "ECG";
    currentHR = ecgHeartRate;
  } else if (ppgReliability > ecgReliability && ppgHeartRate > 0) {
    reliableSource = "PPG";
    currentHR = ppgHeartRate;
  } else if (ecgHeartRate > 0 && ppgHeartRate == 0) {
    reliableSource = "ECG";
    currentHR = ecgHeartRate;
  } else if (ppgHeartRate > 0 && ecgHeartRate == 0) {
    reliableSource = "PPG";
    currentHR = ppgHeartRate;
  } else if (ecgHeartRate > 0) {
    reliableSource = "ECG";
    currentHR = ecgHeartRate;
  } else if (ppgHeartRate > 0) {
    reliableSource = "PPG";
    currentHR = ppgHeartRate;
  } else {
    reliableSource = "NONE";
    currentHR = 0;
  }
}

int calculateHRV() {
  int validCount = 0;
  long sum = 0;
  for (int i = 0; i < AVG_SAMPLES; i++) {
    if (rrIntervals[i] > 0) {
      sum += rrIntervals[i];
      validCount++;
    }
  }
  if (validCount < 2) return 0;
  
  long mean = sum / validCount;
  long variance = 0;
  for (int i = 0; i < AVG_SAMPLES; i++) {
    if (rrIntervals[i] > 0) {
      long diff = rrIntervals[i] - mean;
      variance += (diff * diff);
    }
  }
  variance = variance / validCount;
  rrIntervalVariance = variance;
  return (int)sqrt(variance);
}

void classifyCardiacRhythm() {
  if (ecgHeartRate == 0) {
    rhythmType = "NoSignal";
    rhythmConfidence = 0.0;
    arrhythmiaAlert = false;
    return;
  }
  
  int hrvSDNN = calculateHRV();
  float rrCV = (hrv_ms > 0) ? (float)hrvSDNN / (float)hrv_ms : 0.0;
  float confidence = 0.0;
  String detectedRhythm = "Normal";
  bool criticalAlert = false;
  
  if (ecgHeartRate < 50 && ecgHeartRate > 0) {
    detectedRhythm = "Bradycardia";
    confidence = 85.0 + (50 - ecgHeartRate) * 0.5;
    if (ecgHeartRate < 40) {
      criticalAlert = true;
      confidence = 95.0;
    }
  } else if (ecgHeartRate > 100) {
    detectedRhythm = "Tachycardia";
    confidence = 80.0 + (ecgHeartRate - 100) * 0.3;
    if (ecgHeartRate > 150) {
      criticalAlert = true;
      confidence = 95.0;
    }
  } else if (rrCV > 0.15 && hrvSDNN > 80) {
    int irregularCount = 0;
    for (int i = 1; i < AVG_SAMPLES; i++) {
      if (rrIntervals[i] > 0 && rrIntervals[i-1] > 0) {
        if (abs(rrIntervals[i] - rrIntervals[i-1]) > 150) irregularCount++;
      }
    }
    if (irregularCount >= 2) {
      detectedRhythm = "AFib";
      confidence = 75.0 + (irregularCount * 5.0);
      criticalAlert = true;
    }
  } else if (ecgQRSWidth > 120 && hrv_ms < 600) {
    detectedRhythm = "PVC";
    confidence = 70.0 + ((ecgQRSWidth - 120) * 0.2);
    if (ecgQRSWidth > 140) criticalAlert = true;
  } else if (rrCV > 0.12 || hrvSDNN > 100) {
    detectedRhythm = "Irregular";
    confidence = 65.0 + (rrCV * 100);
  } else if (ecgHeartRate >= 50 && ecgHeartRate <= 100 && rrCV < 0.12 && ecgQRSWidth >= 60 && ecgQRSWidth <= 120) {
    detectedRhythm = "Normal";
    confidence = 90.0;
  }
  
  confidence = confidence * (ecgReliability / 100.0);
  if (confidence > 99.0) confidence = 99.0;
  if (confidence < 50.0 && detectedRhythm != "Normal") confidence = 50.0;
  
  rhythmType = detectedRhythm;
  rhythmConfidence = confidence;
  arrhythmiaAlert = criticalAlert;
}

void detectAnemia() {
  if (currentSPO2 == 0 && currentHR == 0) {
    anemiaRisk = "Unknown";
    anemiaConfidence = 0.0;
    anemiaAlert = false;
    return;
  }
  
  float riskScore = 0.0, confidence = 0.0;
  String detectedRisk = "Low";
  bool criticalAlert = false;
  
  if (currentSPO2 < 88) { riskScore += 40.0; confidence += 30.0; criticalAlert = true; }
  else if (currentSPO2 <= 91) { riskScore += 30.0; confidence += 25.0; }
  else if (currentSPO2 <= 94) { riskScore += 15.0; confidence += 20.0; }
  else { confidence += 15.0; }
  
  if (currentHR > 110) { riskScore += 25.0; confidence += 20.0; }
  else if (currentHR >= 95) { riskScore += 15.0; confidence += 15.0; }
  else if (currentHR >= 70) { confidence += 10.0; }
  
  int hrvSDNN = calculateHRV();
  if (hrvSDNN < 30) { riskScore += 15.0; confidence += 15.0; }
  else if (hrvSDNN < 50) { riskScore += 8.0; confidence += 10.0; }
  else { confidence += 10.0; }
  
  if (bp_sys < 100 && currentSPO2 < 94) { riskScore += 10.0; confidence += 10.0; }
  if (currentHR > 95 && currentSPO2 < 94) { riskScore += 20.0; confidence += 20.0; }
  
  confidence = min(confidence, 95.0f);
  if (riskScore >= 70) { detectedRisk = "Critical"; criticalAlert = true; }
  else if (riskScore >= 50) { detectedRisk = "High"; criticalAlert = true; }
  else if (riskScore >= 30) detectedRisk = "Moderate";
  else if (riskScore >= 15) detectedRisk = "Low-Moderate";
  
  if (ppgReliability < 50) confidence *= 0.7;
  
  anemiaRisk = detectedRisk;
  anemiaConfidence = confidence;
  anemiaAlert = criticalAlert;
}

void detectPreeclampsia() {
  if (bp_sys == 0 || currentHR == 0) {
    preeclampsiaRisk = "Unknown";
    preeclampsiaConfidence = 0.0;
    preeclampsiaAlert = false;
    return;
  }
  
  float riskScore = 0.0, confidence = 0.0;
  String detectedRisk = "Low";
  bool criticalAlert = false;
  
  if (bp_sys >= 160 || bp_dia >= 110) { riskScore += 50.0; confidence += 35.0; criticalAlert = true; }
  else if (bp_sys >= 140 || bp_dia >= 90) { riskScore += 35.0; confidence += 30.0; criticalAlert = true; }
  else if (bp_sys >= 130 || bp_dia >= 85) { riskScore += 20.0; confidence += 25.0; }
  else if (bp_sys >= 120) { riskScore += 10.0; confidence += 20.0; }
  else { confidence += 20.0; }
  
  if (currentHR > 100) { riskScore += 15.0; confidence += 15.0; }
  else if (currentHR >= 90) { riskScore += 8.0; confidence += 10.0; }
  
  int hrvSDNN = calculateHRV();
  if (hrvSDNN < 30) { riskScore += 20.0; confidence += 15.0; }
  else if (hrvSDNN < 50) { riskScore += 12.0; confidence += 10.0; }
  
  if (currentSPO2 < 94 && bp_sys >= 140) { riskScore += 15.0; confidence += 15.0; criticalAlert = true; }
  
  int pulsePressure = bp_sys - bp_dia;
  if (pulsePressure < 35 && bp_sys >= 130) { riskScore += 10.0; confidence += 10.0; }
  if (bp_sys >= 140 && currentHR > 95 && hrvSDNN < 40) { riskScore += 25.0; confidence += 20.0; criticalAlert = true; }
  
  confidence = min(confidence, 95.0f);
  if (riskScore >= 80) { detectedRisk = "Critical"; criticalAlert = true; }
  else if (riskScore >= 60) { detectedRisk = "High"; criticalAlert = true; }
  else if (riskScore >= 40) detectedRisk = "Moderate";
  else if (riskScore >= 20) detectedRisk = "Low-Moderate";
  
  if (ecgReliability < 60) confidence *= 0.8;
  
  preeclampsiaRisk = detectedRisk;
  preeclampsiaConfidence = confidence;
  preeclampsiaAlert = criticalAlert;
}

void calculateMaternalHealthScore() {
  int baseScore = 100;
  if (anemiaRisk == "Critical") baseScore -= 40;
  else if (anemiaRisk == "High") baseScore -= 30;
  else if (anemiaRisk == "Moderate") baseScore -= 20;
  else if (anemiaRisk == "Low-Moderate") baseScore -= 10;
  
  if (preeclampsiaRisk == "Critical") baseScore -= 40;
  else if (preeclampsiaRisk == "High") baseScore -= 30;
  else if (preeclampsiaRisk == "Moderate") baseScore -= 20;
  else if (preeclampsiaRisk == "Low-Moderate") baseScore -= 10;
  
  if (arrhythmiaAlert) baseScore -= 15;
  else if (rhythmType != "Normal") baseScore -= 8;
  if (ecgReliability < 50 || ppgReliability < 50) baseScore -= 5;
  
  maternalHealthScore = max(baseScore, 0);
}

void sendVitals() {
  unsigned long now = millis();
  if (now - lastSend < SEND_INTERVAL_MS) return;
  lastSend = now;
  
  // Select BP method
  if (ptt_ms > 0 && ptt_ms >= 150 && ptt_ms <= 400) {
    bp_sys = bp_sys_ptt;
    bp_dia = bp_dia_ptt;
    bpMethodUsed = "PTT";
  } else {
    bp_sys = bp_sys_ecg;
    bp_dia = bp_dia_ecg;
    bpMethodUsed = "ECG";
  }
  
  int ecgRaw = analogRead(ECG_PIN);
  long irRaw = sensorReady ? maxSensor.getIR() : 0;
  long redRaw = sensorReady ? maxSensor.getRed() : 0;
  
  StaticJsonDocument<512> doc;
  doc["hr"] = currentHR;
  doc["hr_ecg"] = ecgHeartRate;
  doc["hr_ppg"] = ppgHeartRate;
  doc["hr_source"] = reliableSource;
  doc["ecg_quality"] = (int)ecgReliability;
  doc["ppg_quality"] = (int)ppgReliability;
  doc["spo2"] = currentSPO2;
  doc["bp_sys"] = (int)bp_sys;
  doc["bp_dia"] = (int)bp_dia;
  doc["bp_method"] = bpMethodUsed;
  doc["hrv"] = hrv_ms;
  doc["hrv_sdnn"] = calculateHRV();
  doc["ptt"] = (int)ptt_ms;
  doc["rhythm"] = rhythmType;
  doc["rhythm_confidence"] = (int)rhythmConfidence;
  doc["arrhythmia_alert"] = arrhythmiaAlert;
  doc["anemia_risk"] = anemiaRisk;
  doc["anemia_confidence"] = (int)anemiaConfidence;
  doc["anemia_alert"] = anemiaAlert;
  doc["preeclampsia_risk"] = preeclampsiaRisk;
  doc["preeclampsia_confidence"] = (int)preeclampsiaConfidence;
  doc["preeclampsia_alert"] = preeclampsiaAlert;
  doc["maternal_health_score"] = maternalHealthScore;
  doc["ecg"] = ecgRaw;
  doc["ir"] = (int)irRaw;
  doc["red"] = (int)redRaw;
  doc["timestamp"] = millis();
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("========== VITALS ==========");
  Serial.println(jsonString);
  
  if (vitalsChar && deviceConnected) {
    vitalsChar->setValue(jsonString.c_str());
    vitalsChar->notify();
    Serial.print("[BLE] Sent ");
    Serial.print(jsonString.length());
    Serial.println(" bytes");
  }
  Serial.println("============================\n");
}

class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* pServer, ble_gap_conn_desc* desc) {
    deviceConnected = true;
    Serial.println("[BLE] ✓✓✓ CONNECTED ✓✓✓");
    setConnectionLED(true);
  }
  
  void onDisconnect(NimBLEServer* pServer) {
    deviceConnected = false;
    Serial.println("[BLE] DISCONNECTED");
    setConnectionLED(false);
    NimBLEDevice::startAdvertising();
  }
};

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n========================================");
  Serial.println("   LIFEBAND ESP32-S3 v5.0 WORKING");
  Serial.println("========================================");
  
  rgb.begin();
  rgb.setBrightness(50);
  setConnectionLED(false);
  
  pinMode(ECG_PIN, INPUT);
  Wire.begin(11, 12);
  
  if (maxSensor.begin(Wire, I2C_SPEED_FAST)) {
    maxSensor.setup(0x1F, 4, 2, 100, 411, 4096);
    maxSensor.setPulseAmplitudeRed(0x0A);
    maxSensor.setPulseAmplitudeIR(0x0A);
    sensorReady = true;
    Serial.println("[MAX30105] ✓ Configured");
  } else {
    Serial.println("[MAX30105] ✗ NOT FOUND");
  }
  
  NimBLEDevice::init(DEVICE_NAME);
  NimBLEDevice::setPower(ESP_PWR_LVL_P9);
  NimBLEDevice::setMTU(512);
  
  bleServer = NimBLEDevice::createServer();
  bleServer->setCallbacks(new ServerCallbacks());
  
  NimBLEService* pService = bleServer->createService(SERVICE_UUID);
  vitalsChar = pService->createCharacteristic(VITALS_CHAR_UUID, NIMBLE_PROPERTY::NOTIFY);
  pService->start();
  
  NimBLEAdvertising* pAdvertising = NimBLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->start();
  
  Serial.println("[BLE] ✓ Advertising as LIFEBAND-S3");
  Serial.println("========================================\n");
}

void loop() {
  unsigned long now = millis();
  
  int connCount = bleServer->getConnectedCount();
  bool isConnected = (connCount > 0);
  
  if (isConnected != wasConnected) {
    deviceConnected = isConnected;
    wasConnected = isConnected;
    setConnectionLED(isConnected);
    if (!isConnected) {
      lastSend = 0;
      currentHR = 0;
      currentSPO2 = 0;
    }
  }
  
  if (sensorReady && maxSensor.available()) {
    static int sampleCount = 0;
    uint32_t red = maxSensor.getRed();
    uint32_t ir = maxSensor.getIR();
    
    redBuffer[sampleCount % 100] = red;
    irBuffer[sampleCount % 100] = ir;
    
    if (detectPPGPeak(ir)) computePTTandBP();
    
    if (sampleCount % 25 == 0 && ir >= 50000) {
      static unsigned long lastPPGBeat = 0;
      if (now - lastPPGBeat > 400 && now - lastPPGBeat < 2000) {
        ppgHeartRate = 60000 / (now - lastPPGBeat);
      }
      if (ir > 80000) lastPPGBeat = now;
    }
    
    maxSensor.nextSample();
    sampleCount++;
    
    if (sampleCount % 100 == 0) {
      maxim_heart_rate_and_oxygen_saturation(irBuffer, 100, redBuffer, &spo2Value, &validSPO2, &heartRateValue, &validHeartRate);
      if (validSPO2 && spo2Value > 70 && spo2Value <= 100) {
        spo2History[historyIndex] = spo2Value;
        int avgSPO2 = getAverageSPO2();
        if (avgSPO2 > 0) currentSPO2 = avgSPO2;
      }
      historyIndex = (historyIndex + 1) % AVG_SAMPLES;
    }
  } else if (sensorReady) {
    maxSensor.check();
  }
  
  int ecgRaw = analogRead(ECG_PIN);
  detectECGPeak(ecgRaw);
  selectReliableHeartRate();
  sendVitals();
  
  delay(10);
}
