/************************************************************
   LIFEBAND ESP32-S3 - BLUETOOTH STATUS LED FIRMWARE
   - Green LED when Bluetooth connected
   - Red LED when disconnected
   - Auto-reconnect and loop reset on disconnect
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
bool wasConnected = false;  // Track previous connection state

unsigned long lastSend = 0;
const unsigned long SEND_INTERVAL_MS = 5000;  // 5 seconds for testing (change to 600000 for 10 minutes)

// === CIRCULAR BUFFER FOR OFFLINE STORAGE ===
struct VitalsRecord {
  unsigned long timestamp;
  int hr;
  int spo2;
  float bp_sys;
  float bp_dia;
  int hrv;
  String rhythmType;
  String anemiaRisk;
  String preeclampsiaRisk;
  int maternalScore;
  bool valid;
};

const int VITALS_BUFFER_SIZE = 144;
VitalsRecord vitalBuffer[VITALS_BUFFER_SIZE];
int bufferWriteIndex = 0;
int bufferReadIndex = 0;
int bufferedCount = 0;

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
unsigned long lastHeartBeat = 0;
int hrv_ms = 0;

bool ecgPeakDetected = false;
int ecgThreshold = 600;
int ecgBaseline = 512;

float bp_sys = 120;
float bp_dia = 80;

int ecgPeakAmplitude = 0;
int ecgQRSWidth = 0;
int lastValidHR = 75;
float hrvRatio = 1.0;

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

// === EDGE AI: ECG Arrhythmia Detection ===
String rhythmType = "Normal";
float rhythmConfidence = 0.0;
bool arrhythmiaAlert = false;
int rrIntervalVariance = 0;
unsigned long lastRhythmCheck = 0;

// === EDGE AI: Pregnancy Health Monitoring ===
String anemiaRisk = "Low";
float anemiaConfidence = 0.0;
bool anemiaAlert = false;

String preeclampsiaRisk = "Low";
float preeclampsiaConfidence = 0.0;
bool preeclampsiaAlert = false;

int maternalHealthScore = 100;
unsigned long lastPregnancyCheck = 0;

// === RGB LED STATUS FUNCTIONS ===
void setConnectionLED(bool connected) {
  if (connected) {
    // Green for connected
    rgb.setPixelColor(0, rgb.Color(0, 255, 0));
    rgb.show();
  } else {
    // Red for disconnected
    rgb.setPixelColor(0, rgb.Color(255, 0, 0));
    rgb.show();
  }
}

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
  // Restore connection status color
  setConnectionLED(deviceConnected);
}

// === BUFFER MANAGEMENT ===
void storeVitalsInBuffer() {
  VitalsRecord& record = vitalBuffer[bufferWriteIndex];
  record.timestamp = millis();
  record.hr = currentHR;
  record.spo2 = currentSPO2;
  record.bp_sys = bp_sys;
  record.bp_dia = bp_dia;
  record.hrv = hrv_ms;
  record.rhythmType = rhythmType;
  record.anemiaRisk = anemiaRisk;
  record.preeclampsiaRisk = preeclampsiaRisk;
  record.maternalScore = maternalHealthScore;
  record.valid = true;
  
  bufferWriteIndex = (bufferWriteIndex + 1) % VITALS_BUFFER_SIZE;
  if (bufferedCount < VITALS_BUFFER_SIZE) {
    bufferedCount++;
  } else {
    bufferReadIndex = (bufferReadIndex + 1) % VITALS_BUFFER_SIZE;
  }
  
  Serial.print("[BUFFER] Stored vitals. Buffered count: ");
  Serial.println(bufferedCount);
}

void sendBufferedVitals() {
  if (!deviceConnected || !vitalsChar || bufferedCount == 0) {
    return;
  }
  
  Serial.print("\n[BUFFER] Sending ");
  Serial.print(bufferedCount);
  Serial.println(" buffered readings...");
  
  int sentCount = 0;
  while (bufferedCount > 0 && sentCount < 10) {
    VitalsRecord& record = vitalBuffer[bufferReadIndex];
    
    if (record.valid) {
      StaticJsonDocument<512> doc;
      doc["hr"] = record.hr;
      doc["bp_sys"] = (int)record.bp_sys;
      doc["bp_dia"] = (int)record.bp_dia;
      doc["spo2"] = record.spo2;
      doc["hrv"] = record.hrv;
      doc["ecg"] = 0;
      doc["ir"] = 0;
      doc["timestamp"] = record.timestamp / 1000;
      doc["rhythm"] = record.rhythmType;
      doc["anemia_risk"] = record.anemiaRisk;
      doc["preeclampsia_risk"] = record.preeclampsiaRisk;
      doc["maternal_health_score"] = record.maternalScore;
      doc["buffered"] = true;
      
      String jsonString;
      serializeJson(doc, jsonString);
      
      vitalsChar->setValue(jsonString.c_str());
      vitalsChar->notify();
      sentCount++;
      
      delay(100);
    }
    
    record.valid = false;
    bufferReadIndex = (bufferReadIndex + 1) % VITALS_BUFFER_SIZE;
    bufferedCount--;
  }
  
  Serial.print("[BUFFER] Sent ");
  Serial.print(sentCount);
  Serial.print(" readings. Remaining: ");
  Serial.println(bufferedCount);
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
          
          // Always calculate BP from ECG (no PTT needed)
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

// BP is calculated only from ECG (AD8232 sensor)
// PTT method removed - using ECG-only parameters for BP estimation

void calculateBPFromECG() {
  // === PRIMARY BP ESTIMATION METHOD ===
  // Uses ONLY AD8232 ECG sensor parameters:
  // - Heart Rate, HRV, R-peak amplitude, QRS width
  // No MAX30105 PPG data needed
  
  if (currentHR == 0) return;
  
  int hrvSDNN = calculateHRV();
  if (hrv_ms > 0) {
    hrvRatio = (float)hrvSDNN / (float)hrv_ms;
  }
  
  float hrComponent = 100.0 + ((currentHR - 70) * 0.5);
  float amplitudeComponent = (ecgPeakAmplitude - 200) * 0.08;
  float qrsComponent = 0;
  if (ecgQRSWidth > 100) {
    qrsComponent = (ecgQRSWidth - 100) * 0.3;
  }
  float hrvComponent = -1.0 * (hrvSDNN * 0.1);
  
  bp_sys = hrComponent + amplitudeComponent + qrsComponent + hrvComponent;
  
  float diastolicBase = 60.0 + ((currentHR - 70) * 0.3);
  float diastolicHRV = -1.0 * (hrvSDNN * 0.05);
  float rrComponent = 0;
  if (hrv_ms > 800) {
    rrComponent = -1.0 * ((hrv_ms - 800) * 0.01);
  } else if (hrv_ms < 600) {
    rrComponent = (600 - hrv_ms) * 0.02;
  }
  
  bp_dia = diastolicBase + diastolicHRV + rrComponent;
  
  if (bp_sys < 90) bp_sys = 90;
  if (bp_sys > 180) bp_sys = 180;
  if (bp_dia < 60) bp_dia = 60;
  if (bp_dia > 120) bp_dia = 120;
  
  if (bp_dia >= bp_sys - 25) {
    bp_dia = bp_sys - 30;
  }
  
  float pulsePressure = bp_sys - bp_dia;
  if (pulsePressure < 30) {
    bp_dia = bp_sys - 35;
  } else if (pulsePressure > 70) {
    bp_dia = bp_sys - 60;
  }
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

void calculateECGReliability() {
  float score = 0.0;
  
  if (ecgPeakAmplitude >= 200 && ecgPeakAmplitude <= 800) {
    score += 40.0;
  } else if (ecgPeakAmplitude >= 100 && ecgPeakAmplitude <= 1000) {
    score += 25.0;
  } else if (ecgPeakAmplitude > 0) {
    score += 10.0;
  }
  
  if (ecgQRSWidth >= 60 && ecgQRSWidth <= 120) {
    score += 20.0;
  } else if (ecgQRSWidth > 40 && ecgQRSWidth <= 150) {
    score += 10.0;
  }
  
  if (ecgHeartRate >= 50 && ecgHeartRate <= 150) {
    score += 20.0;
  } else if (ecgHeartRate >= 40 && ecgHeartRate <= 200) {
    score += 10.0;
  }
  
  int hrvSDNN = calculateHRV();
  if (hrvSDNN > 0 && hrvSDNN < 100) {
    score += 20.0;
  } else if (hrvSDNN >= 100 && hrvSDNN < 200) {
    score += 10.0;
  }
  
  ecgReliability = score;
}

void calculatePPGReliability() {
  float score = 0.0;
  
  long irValue = sensorReady ? maxSensor.getIR() : 0;
  if (irValue >= 50000 && irValue <= 200000) {
    score += 30.0;
  } else if (irValue >= 20000 && irValue <= 250000) {
    score += 15.0;
  } else if (irValue > 10000) {
    score += 5.0;
  }
  
  long redValue = sensorReady ? maxSensor.getRed() : 0;
  if (redValue >= 30000 && redValue <= 150000) {
    score += 20.0;
  } else if (redValue >= 10000 && redValue <= 200000) {
    score += 10.0;
  }
  
  if (validHeartRate) {
    score += 15.0;
  }
  if (validSPO2) {
    score += 15.0;
  }
  
  if (ppgHeartRate >= 50 && ppgHeartRate <= 150) {
    score += 20.0;
  } else if (ppgHeartRate >= 40 && ppgHeartRate <= 200) {
    score += 10.0;
  }
  
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
  float rrCV = 0.0;
  if (hrv_ms > 0) {
    rrCV = (float)hrvSDNN / (float)hrv_ms;
  }
  
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
        int diff = abs(rrIntervals[i] - rrIntervals[i-1]);
        if (diff > 150) {
          irregularCount++;
        }
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
    if (ecgQRSWidth > 140) {
      criticalAlert = true;
    }
  } else if (rrCV > 0.12 || hrvSDNN > 100) {
    detectedRhythm = "Irregular";
    confidence = 65.0 + (rrCV * 100);
  } else if (ecgHeartRate >= 50 && ecgHeartRate <= 100 && 
           rrCV < 0.12 && ecgQRSWidth >= 60 && ecgQRSWidth <= 120) {
    detectedRhythm = "Normal";
    confidence = 90.0;
    criticalAlert = false;
  }
  
  confidence = confidence * (ecgReliability / 100.0);
  if (confidence > 99.0) confidence = 99.0;
  if (confidence < 50.0 && detectedRhythm != "Normal") {
    confidence = 50.0;
  }
  
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
  
  float riskScore = 0.0;
  float confidence = 0.0;
  String detectedRisk = "Low";
  bool criticalAlert = false;
  
  if (currentSPO2 < 88) {
    riskScore += 40.0;
    confidence += 30.0;
    criticalAlert = true;
  } else if (currentSPO2 >= 88 && currentSPO2 <= 91) {
    riskScore += 30.0;
    confidence += 25.0;
  } else if (currentSPO2 >= 92 && currentSPO2 <= 94) {
    riskScore += 15.0;
    confidence += 20.0;
  } else if (currentSPO2 >= 95) {
    riskScore += 0.0;
    confidence += 15.0;
  }
  
  if (currentHR > 110) {
    riskScore += 25.0;
    confidence += 20.0;
  } else if (currentHR >= 95 && currentHR <= 110) {
    riskScore += 15.0;
    confidence += 15.0;
  } else if (currentHR >= 70 && currentHR <= 94) {
    riskScore += 0.0;
    confidence += 10.0;
  }
  
  int hrvSDNN = calculateHRV();
  if (hrvSDNN < 30) {
    riskScore += 15.0;
    confidence += 15.0;
  } else if (hrvSDNN >= 30 && hrvSDNN < 50) {
    riskScore += 8.0;
    confidence += 10.0;
  } else {
    confidence += 10.0;
  }
  
  if (bp_sys < 100 && currentSPO2 < 94) {
    riskScore += 10.0;
    confidence += 10.0;
  }
  
  if (currentHR > 95 && currentSPO2 < 94) {
    riskScore += 20.0;
    confidence += 20.0;
  }
  
  confidence = min(confidence, 95.0f);
  
  if (riskScore >= 70) {
    detectedRisk = "Critical";
    criticalAlert = true;
  } else if (riskScore >= 50) {
    detectedRisk = "High";
    criticalAlert = true;
  } else if (riskScore >= 30) {
    detectedRisk = "Moderate";
  } else if (riskScore >= 15) {
    detectedRisk = "Low-Moderate";
  } else {
    detectedRisk = "Low";
  }
  
  if (ppgReliability < 50) {
    confidence *= 0.7;
  }
  
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
  
  float riskScore = 0.0;
  float confidence = 0.0;
  String detectedRisk = "Low";
  bool criticalAlert = false;
  
  if (bp_sys >= 160 || bp_dia >= 110) {
    riskScore += 50.0;
    confidence += 35.0;
    criticalAlert = true;
  } else if (bp_sys >= 140 || bp_dia >= 90) {
    riskScore += 35.0;
    confidence += 30.0;
    criticalAlert = true;
  } else if (bp_sys >= 130 || bp_dia >= 85) {
    riskScore += 20.0;
    confidence += 25.0;
  } else if (bp_sys >= 120 && bp_sys < 130) {
    riskScore += 10.0;
    confidence += 20.0;
  } else {
    confidence += 20.0;
  }
  
  if (currentHR > 100) {
    riskScore += 15.0;
    confidence += 15.0;
  } else if (currentHR >= 90 && currentHR <= 100) {
    riskScore += 8.0;
    confidence += 10.0;
  }
  
  int hrvSDNN = calculateHRV();
  if (hrvSDNN < 30) {
    riskScore += 20.0;
    confidence += 15.0;
  } else if (hrvSDNN >= 30 && hrvSDNN < 50) {
    riskScore += 12.0;
    confidence += 10.0;
  }
  
  if (currentSPO2 < 94 && bp_sys >= 140) {
    riskScore += 15.0;
    confidence += 15.0;
    criticalAlert = true;
  }
  
  int pulsePressure = bp_sys - bp_dia;
  if (pulsePressure < 35 && bp_sys >= 130) {
    riskScore += 10.0;
    confidence += 10.0;
  }
  
  if (bp_sys >= 140 && currentHR > 95 && hrvSDNN < 40) {
    riskScore += 25.0;
    confidence += 20.0;
    criticalAlert = true;
  }
  
  confidence = min(confidence, 95.0f);
  
  if (riskScore >= 80) {
    detectedRisk = "Critical";
    criticalAlert = true;
  } else if (riskScore >= 60) {
    detectedRisk = "High";
    criticalAlert = true;
  } else if (riskScore >= 40) {
    detectedRisk = "Moderate";
  } else if (riskScore >= 20) {
    detectedRisk = "Low-Moderate";
  } else {
    detectedRisk = "Low";
  }
  
  if (ecgReliability < 60) {
    confidence *= 0.8;
  }
  
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
  
  if (now - lastSend < SEND_INTERVAL_MS) {
    return;
  }
  
  lastSend = now;
  
  int ecgRaw = analogRead(ECG_PIN);
  long irRaw = sensorReady ? maxSensor.getIR() : 0;
  long redRaw = sensorReady ? maxSensor.getRed() : 0;
  int hrvSDNN = calculateHRV();
  
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
  doc["bp_method"] = "ECG";
  doc["hrv"] = hrv_ms;
  doc["hrv_sdnn"] = hrvSDNN;
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
  
  Serial.println("========================================");
  Serial.print("[VITALS] ");
  Serial.println(jsonString);
  
  if (vitalsChar && deviceConnected) {
    vitalsChar->setValue(jsonString.c_str());
    vitalsChar->notify();
    Serial.print("[BLE] Sent (");
    Serial.print(jsonString.length());
    Serial.println(" bytes)");
  } else {
    storeVitalsInBuffer();
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
    
    // Set LED to GREEN
    setConnectionLED(true);
    
    if (bufferedCount > 0) {
      delay(2000);
      Serial.print("[BLE] Sending ");
      Serial.print(bufferedCount);
      Serial.println(" buffered readings...");
      sendBufferedVitals();
    }
  }
  
  void onDisconnect(NimBLEServer* pServer) {
    deviceConnected = false;
    Serial.println("\n========================================");
    Serial.println("[BLE] DISCONNECTED");
    Serial.println("[BLE] Restarting advertising...");
    Serial.println("========================================\n");
    
    // Set LED to RED
    setConnectionLED(false);
    
    // Restart advertising
    NimBLEDevice::startAdvertising();
    Serial.println("[BLE] Advertising restarted - ready for reconnection");
  }
};

class VitalsCallbacks : public NimBLECharacteristicCallbacks {
  void onSubscribe(NimBLECharacteristic* pCharacteristic, ble_gap_conn_desc* desc, uint16_t subValue) {
    if (subValue > 0) {
      Serial.println("[BLE] Notifications enabled");
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
  Serial.println("   LIFEBAND ESP32-S3 v5.0");
  Serial.println("   Bluetooth Status LED Enabled");
  Serial.println("   Auto-reconnect & Loop Reset");
  Serial.println("========================================");
  
  rgb.begin();
  rgb.setBrightness(50);
  
  // Start with RED (disconnected)
  setConnectionLED(false);
  
  pinMode(ECG_PIN, INPUT);
  Serial.println("[ECG] AD8232 initialized on GPIO4");
  
  Serial.println("[SENSOR] Initializing MAX30105...");
  Wire.begin(11, 12);
  
  if (maxSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("[MAX30105] ✓ Sensor found!");
    maxSensor.setup(0x1F, 4, 2, 100, 411, 4096);
    maxSensor.setPulseAmplitudeRed(0x0A);
    maxSensor.setPulseAmplitudeIR(0x0A);
    sensorReady = true;
    Serial.println("[MAX30105] ✓ Configured");
  } else {
    Serial.println("[MAX30105] ✗ NOT FOUND");
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
  Serial.println("\n========================================");
  Serial.println("   ✓✓✓ SYSTEM READY ✓✓✓");
  Serial.println("   LED: RED = Disconnected");
  Serial.println("   LED: GREEN = Connected");
  Serial.println("========================================\n");
}

void loop() {
  unsigned long now = millis();
  
  // Check connection state
  int connCount = bleServer->getConnectedCount();
  bool isConnected = (connCount > 0);
  
  // Update connection state and LED
  if (isConnected != wasConnected) {
    if (isConnected) {
      deviceConnected = true;
      wasConnected = true;
      Serial.println("[BLE] ✓ Connection detected");
      setConnectionLED(true);
    } else {
      deviceConnected = false;
      wasConnected = false;
      Serial.println("[BLE] Connection lost - resetting loop");
      setConnectionLED(false);
      
      // Reset variables on disconnect
      lastSend = 0;
      historyIndex = 0;
      ecgHeartRate = 0;
      ppgHeartRate = 0;
      currentHR = 0;
      currentSPO2 = 0;
    }
  }
  
  // Read sensors
  if (sensorReady && maxSensor.available()) {
    static int sampleCount = 0;
    
    uint32_t red = maxSensor.getRed();
    uint32_t ir = maxSensor.getIR();
    
      redBuffer[sampleCount % 100] = red;
      irBuffer[sampleCount % 100] = ir;    if (sampleCount % 25 == 0 && ir >= 50000) {
      static unsigned long lastPPGBeat = 0;
      unsigned long now = millis();
      if (now - lastPPGBeat > 400 && now - lastPPGBeat < 2000) {
        ppgHeartRate = 60000 / (now - lastPPGBeat);
      }
      if (ir > 80000) lastPPGBeat = now;
    }
    
    maxSensor.nextSample();
    sampleCount++;
    
    if (sampleCount % 100 == 0 && sampleCount > 0) {
      maxim_heart_rate_and_oxygen_saturation(
        irBuffer, 100,
        redBuffer,
        &spo2Value, &validSPO2,
        &heartRateValue, &validHeartRate
      );
      
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
  
  // Read ECG
  int ecgRaw = analogRead(ECG_PIN);
  detectECGPeak(ecgRaw);
  
  // Select reliable HR
  selectReliableHeartRate();
  
  // Send vitals
  sendVitals();
  
  delay(10);
}
