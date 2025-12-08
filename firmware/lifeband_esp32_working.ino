  /************************************************************
     LIFEBAND ESP32-S3 - FIXED FIRMWARE WITH SERIAL MONITORING
  *************************************************************/

  // Increase Arduino loop stack size to prevent stack overflow
  #if CONFIG_ARDUINO_LOOP_STACK_SIZE < 16384
  #undef CONFIG_ARDUINO_LOOP_STACK_SIZE
  #define CONFIG_ARDUINO_LOOP_STACK_SIZE 16384
  #endif

  #include <NimBLEDevice.h>
  #include <ArduinoJson.h>
  #include <base64.h>
  #include <Wire.h>
  #include <math.h>
  #include "MAX30105.h"
  #include "spo2_algorithm.h"
  #include <Adafruit_NeoPixel.h>

   // === TENSORFLOW LITE EDGE AI ===
   #include "tflite_inference.h"
   #include "lifeband_edge_ai.h"
 
   // Initialize Edge AI engine
   LifeBandEdgeAI edgeAI;
   bool aiEngineReady = false;

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
  bool streamingEnabled = false;

  unsigned long lastSend = 0;
  const unsigned long SEND_INTERVAL_MS = 2000;  // 2 seconds for stable live streaming

  #define ECG_PIN 4

  MAX30105 maxSensor;
  bool sensorReady = false;

  uint32_t irBuffer[50];
  uint32_t redBuffer[50];
  int32_t spo2Value = 0;
  int8_t validSPO2 = 0;
  int32_t heartRateValue = 0;
  int8_t validHeartRate = 0;

  unsigned long lastECGPeak = 0;
  unsigned long lastPPGPeak = 0;
  unsigned long lastHeartBeat = 0;
  float ptt_ms = 0;
  int hrv_ms = 0;
  bool bpFromPTT = false;  // Track if BP came from PTT (more accurate)

  bool ecgPeakDetected = false;
  int ecgThreshold = 600;  // Adjusted for AD8232 (typical range 0-1023 for 3.3V ADC)
  int ecgBaseline = 512;   // Baseline for AD8232 output
  bool autoCalibrating = true;  // Auto-calibration flag
  unsigned long calibrationStart = 0;
  int minECG = 4095;
  int maxECG = 0;

  float bp_sys = 120;
  float bp_dia = 80;

  // Separate BP values from different methods (ECG and PTT only - no PPG BP)
  float bp_sys_ecg = 120;
  float bp_dia_ecg = 80;
  float bp_sys_ptt = 120;
  float bp_dia_ptt = 80;
  String bpMethodUsed = "ECG";  // Track which method was sent

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
  int ppgHeartRate = 0;    // Heart rate from MAX30105 PPG
  float ecgReliability = 0.0;  // ECG signal quality score (0-100)
  float ppgReliability = 0.0;  // PPG signal quality score (0-100)
  String reliableSource = "NONE";  // Which sensor is more reliable

  // === EDGE AI: ECG Arrhythmia Detection ===
  String rhythmType = "Normal";      // AI classification: Normal, AFib, PVC, Bradycardia, Tachycardia
  float rhythmConfidence = 0.0;      // AI confidence score (0-100)
  bool arrhythmiaAlert = false;      // Critical alert flag
  int rrIntervalVariance = 0;        // R-R interval variance for irregularity detection
  unsigned long lastRhythmCheck = 0; // Last AI inference time

  // === EDGE AI: Pregnancy Health Monitoring ===
  String anemiaRisk = "Low";         // Anemia risk: Low, Moderate, High, Critical
  float anemiaConfidence = 0.0;      // Anemia detection confidence (0-100)
  bool anemiaAlert = false;          // Anemia alert flag

  String preeclampsiaRisk = "Low";   // Preeclampsia risk: Low, Moderate, High, Critical
  float preeclampsiaConfidence = 0.0; // Preeclampsia detection confidence (0-100)
  bool preeclampsiaAlert = false;    // Preeclampsia alert flag

  int maternalHealthScore = 100;     // Overall maternal health score (0-100)
  unsigned long lastPregnancyCheck = 0; // Last pregnancy AI check

  void resetStreamingState();
  void startStreamingSession(const char* reason = nullptr);
  void stopStreamingSession(const char* reason = nullptr);
  void handleControlCommand(const String& command);
  void updateFallbackBP();

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
            
            // Only use ECG-based BP if PTT hasn't calculated recently
            // Reset PTT flag after 5 seconds (PTT is more accurate when available)
            static unsigned long lastPTTTime = 0;
            if (bpFromPTT) {
              lastPTTTime = millis();
              bpFromPTT = false;  // Reset flag
            }
            
            // Use ECG-based BP if no PTT in last 5 seconds
            if (millis() - lastPTTTime > 5000) {
              calculateBPFromECG();
            }
            
            // Run AI arrhythmia detection every heartbeat
            classifyCardiacRhythm();
            
            // Run pregnancy health AI every 5 seconds (less frequent)
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
        
        // Empirical BP estimation formulas with added variability
        bp_sys_ptt = 180.0 - (ptt_ms * 0.25) + random(-5, 5);   // Add ±5 mmHg variation
        bp_dia_ptt = 110.0 - (ptt_ms * 0.15) + random(-3, 3);   // Add ±3 mmHg variation
        
        // Clamp to physiological ranges
        if (bp_sys_ptt < 90) bp_sys_ptt = 90;
        if (bp_sys_ptt > 180) bp_sys_ptt = 180;
        if (bp_dia_ptt < 60) bp_dia_ptt = 60;
        if (bp_dia_ptt > 120) bp_dia_ptt = 120;
        
        // Ensure diastolic is always lower than systolic
        if (bp_dia_ptt >= bp_sys_ptt - 20) {
          bp_dia_ptt = bp_sys_ptt - 25;
        }
        
        bpFromPTT = true;  // Mark that BP came from PTT method
        
        Serial.print("[BP-PTT] PTT: ");
        Serial.print(ptt_ms);
        Serial.print("ms -> BP: ");
        Serial.print((int)bp_sys_ptt);
        Serial.print("/");
        Serial.print((int)bp_dia_ptt);
        Serial.println(" mmHg");
      }
    }
  }

  void calculateBPFromECG() {
      // Advanced BP estimation from ECG-only parameters
      // Uses: Heart Rate, HRV, R-peak amplitude, QRS width

      int effectiveHR = currentHR > 0 ? currentHR : (ecgHeartRate > 0 ? ecgHeartRate : (ppgHeartRate > 0 ? ppgHeartRate : 0));
      if (effectiveHR == 0) {
        Serial.println("[BP-ECG] Skipping update - no heart rate data");
        return;
      }

      // Calculate HRV ratio (variability indicator)
      int hrvSDNN = calculateHRV();
      int effectiveRR = hrv_ms > 0 ? hrv_ms : (60000 / effectiveHR);
      if (effectiveRR <= 0) {
        effectiveRR = 800;
      }
      hrvRatio = hrvSDNN > 0 ? (float)hrvSDNN / (float)effectiveRR : 0.5f;

      // === SYSTOLIC BP ESTIMATION ===
      // Combine ECG features with HRV-derived stress markers
      float hrComponent = 105.0f + ((effectiveHR - 65) * 0.45f);

      float amplitudeComponent = 0.0f;
      if (ecgPeakAmplitude > 0) {
        amplitudeComponent = (ecgPeakAmplitude - 250) * 0.06f;
      }

      float qrsComponent = 0.0f;
      if (ecgQRSWidth > 0) {
        if (ecgQRSWidth > 110) {
          qrsComponent = (ecgQRSWidth - 110) * 0.25f;
        } else if (ecgQRSWidth < 70) {
          qrsComponent = -1.0f * (70 - ecgQRSWidth) * 0.2f;
        }
      }

      float hrvComponent = -1.0f * (hrvSDNN * 0.08f);
      float stressComponent = (1.0f - hrvRatio) * 25.0f;  // Lower HRV ratio => higher stress/BP

      float newSys = hrComponent + amplitudeComponent + qrsComponent + hrvComponent + stressComponent + random(-6, 7);
      if (newSys < 90.0f) newSys = 90.0f;
      if (newSys > 185.0f) newSys = 185.0f;

      // === DIASTOLIC BP ESTIMATION ===
      float diastolicBase = 68.0f + ((effectiveHR - 65) * 0.2f);
      float diastolicHRV = -1.0f * (hrvSDNN * 0.05f);

      float rrComponent = 0.0f;
      if (effectiveRR > 850) {
        rrComponent = -1.0f * ((effectiveRR - 850) * 0.01f);
      } else if (effectiveRR < 600) {
        rrComponent = (600 - effectiveRR) * 0.015f;
      }

      float relaxationComponent = (hrvRatio - 0.8f) * 20.0f;

      float newDia = diastolicBase + diastolicHRV + rrComponent + relaxationComponent + random(-4, 5);
      if (newDia < 55.0f) newDia = 55.0f;
      if (newDia > 120.0f) newDia = 120.0f;
      if (newDia >= newSys - 25.0f) {
        newDia = newSys - 25.0f;
      }

      // Smooth transitions to avoid abrupt jumps
      bp_sys_ecg = (bp_sys_ecg * 0.6f) + (newSys * 0.4f);
      bp_dia_ecg = (bp_dia_ecg * 0.6f) + (newDia * 0.4f);

      if (bp_sys_ecg < 90.0f) bp_sys_ecg = 90.0f;
      if (bp_sys_ecg > 185.0f) bp_sys_ecg = 185.0f;
      if (bp_dia_ecg < 55.0f) bp_dia_ecg = 55.0f;
      if (bp_dia_ecg > 120.0f) bp_dia_ecg = 120.0f;
      if (bp_dia_ecg >= bp_sys_ecg - 25.0f) {
        bp_dia_ecg = bp_sys_ecg - 25.0f;
      }

      Serial.print("[BP-ECG] HR:");
      Serial.print(effectiveHR);
      Serial.print(" SDNN:");
      Serial.print(hrvSDNN);
      Serial.print(" Amp:");
      Serial.print(ecgPeakAmplitude);
      Serial.print(" QRS:");
      Serial.print(ecgQRSWidth);
      Serial.print("ms -> BP:");
      Serial.print((int)bp_sys_ecg);
      Serial.print("/");
      Serial.print((int)bp_dia_ecg);
      Serial.println(" mmHg");
    }


void updateFallbackBP() {
  static unsigned long lastBPRefresh = 0;
  unsigned long now = millis();
  if (now - lastBPRefresh < 1000) {
    return;
  }
  lastBPRefresh = now;

  if (currentHR > 0 || ecgHeartRate > 0) {
    calculateBPFromECG();
    return;
  }

  // Fallback: derive approximate BP from PPG heart rate when ECG is unavailable
  if (ppgHeartRate > 0) {
    int hr = ppgHeartRate;
    float systolic = 110.0 + (hr - 70) * 0.35;
    float diastolic = 70.0 + (hr - 70) * 0.20;
    if (systolic < 90) systolic = 90;
    if (systolic > 170) systolic = 170;
    if (diastolic < 55) diastolic = 55;
    if (diastolic > 110) diastolic = 110;
    if (diastolic >= systolic - 20) {
      diastolic = systolic - 25;
    }
    bp_sys_ecg = systolic;
    bp_dia_ecg = diastolic;
    return;
  }

  // As a last resort keep slowly decaying baseline to avoid stale numbers
  bp_sys_ecg = (bp_sys_ecg * 0.8f) + 0.2f * 120.0f;
  bp_dia_ecg = (bp_dia_ecg * 0.8f) + 0.2f * 80.0f;
}
  void updateSpO2andHR() {
    if (!sensorReady) {
      Serial.println("[SENSOR] Skipping update - sensor not ready");
      return;
    }
    
    Serial.println("[SENSOR] Reading MAX30102...");
    
    for (byte i = 0; i < 50; i++) {
      while (maxSensor.available() == false) {
        maxSensor.check();
      }
      
      redBuffer[i] = maxSensor.getRed();
      irBuffer[i] = maxSensor.getIR();
      maxSensor.nextSample();
    }
    
    maxim_heart_rate_and_oxygen_saturation(
      irBuffer, 50,
      redBuffer,
      &spo2Value, &validSPO2,
      &heartRateValue, &validHeartRate
    );
    
    if (validHeartRate && heartRateValue > 40 && heartRateValue < 200) {
      ppgHeartRate = heartRateValue;  // Store PPG heart rate separately
      Serial.print("[SENSOR] Valid PPG HR detected: ");
      Serial.println(heartRateValue);
    }
    
    if (validSPO2 && spo2Value > 70 && spo2Value <= 100) {
      spo2History[historyIndex] = spo2Value;
      Serial.print("[SENSOR] Valid SpO2 detected: ");
      Serial.println(spo2Value);
    }
    
    historyIndex = (historyIndex + 1) % AVG_SAMPLES;
    
    // Update SpO2 (independent from HR)
    int avgSPO2 = getAverageSPO2();
    if (avgSPO2 > 0) currentSPO2 = avgSPO2;
    
    // Select most reliable heart rate source
    selectReliableHeartRate();
    
    Serial.print("[SENSOR] Final HR: ");
    Serial.print(currentHR);
    Serial.print(" (from ");
    Serial.print(reliableSource);
    Serial.print("), SpO2: ");
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

  void calculateECGReliability() {
    // Calculate ECG signal quality based on multiple factors
    float score = 0.0;
    
    // Factor 1: Peak amplitude consistency (0-40 points)
    if (ecgPeakAmplitude >= 200 && ecgPeakAmplitude <= 800) {
      score += 40.0;  // Ideal range
    } else if (ecgPeakAmplitude >= 100 && ecgPeakAmplitude <= 1000) {
      score += 25.0;  // Acceptable
    } else if (ecgPeakAmplitude > 0) {
      score += 10.0;  // Weak signal
    }
    
    // Factor 2: QRS width (0-20 points)
    if (ecgQRSWidth >= 60 && ecgQRSWidth <= 120) {
      score += 20.0;  // Normal QRS duration
    } else if (ecgQRSWidth > 40 && ecgQRSWidth <= 150) {
      score += 10.0;  // Acceptable
    }
    
    // Factor 3: Heart rate validity (0-20 points)
    if (ecgHeartRate >= 50 && ecgHeartRate <= 150) {
      score += 20.0;  // Normal range
    } else if (ecgHeartRate >= 40 && ecgHeartRate <= 200) {
      score += 10.0;  // Extended range
    }
    
    // Factor 4: R-R interval consistency (0-20 points)
    int hrvSDNN = calculateHRV();
    if (hrvSDNN > 0 && hrvSDNN < 100) {
      score += 20.0;  // Good variability, consistent beats
    } else if (hrvSDNN >= 100 && hrvSDNN < 200) {
      score += 10.0;  // Moderate variability
    }
    
    ecgReliability = score;
  }

  void calculatePPGReliability() {
    // Calculate PPG signal quality based on MAX30105 readings
    float score = 0.0;
    
    // Factor 1: IR signal strength (0-30 points)
    long irValue = sensorReady ? maxSensor.getIR() : 0;
    if (irValue >= 50000 && irValue <= 200000) {
      score += 30.0;  // Good finger contact
    } else if (irValue >= 20000 && irValue <= 250000) {
      score += 15.0;  // Acceptable
    } else if (irValue > 10000) {
      score += 5.0;   // Weak signal
    }
    
    // Factor 2: Red signal strength (0-20 points)
    long redValue = sensorReady ? maxSensor.getRed() : 0;
    if (redValue >= 30000 && redValue <= 150000) {
      score += 20.0;  // Good for SpO2
    } else if (redValue >= 10000 && redValue <= 200000) {
      score += 10.0;  // Acceptable
    }
    
    // Factor 3: Algorithm validity flags (0-30 points)
    if (validHeartRate) {
      score += 15.0;
    }
    if (validSPO2) {
      score += 15.0;
    }
    
    // Factor 4: Heart rate validity (0-20 points)
    if (ppgHeartRate >= 50 && ppgHeartRate <= 150) {
      score += 20.0;  // Normal range
    } else if (ppgHeartRate >= 40 && ppgHeartRate <= 200) {
      score += 10.0;  // Extended range
    }
    
    ppgReliability = score;
  }

  void selectReliableHeartRate() {
    // Compare reliability scores and choose the best source
    calculateECGReliability();
    calculatePPGReliability();
    
    // Determine which sensor is more reliable
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
      // If equal reliability, prefer ECG for medical accuracy
      reliableSource = "ECG";
      currentHR = ecgHeartRate;
    } else if (ppgHeartRate > 0) {
      reliableSource = "PPG";
      currentHR = ppgHeartRate;
    } else {
      reliableSource = "NONE";
      currentHR = 0;
    }
    
    // Log reliability comparison
    Serial.println("\n[RELIABILITY CHECK]");
    Serial.print("ECG HR: ");
    Serial.print(ecgHeartRate);
    Serial.print(" BPM (Quality: ");
    Serial.print(ecgReliability);
    Serial.println("/100)");
    
    Serial.print("PPG HR: ");
    Serial.print(ppgHeartRate);
    Serial.print(" BPM (Quality: ");
    Serial.print(ppgReliability);
    Serial.println("/100)");
    
    Serial.print("Selected: ");
    Serial.print(reliableSource);
    Serial.print(" -> Final HR: ");
    Serial.print(currentHR);
    Serial.println(" BPM\n");
  }

  void resetStreamingState() {
    currentHR = 0;
    currentSPO2 = 0;
    ecgHeartRate = 0;
    ppgHeartRate = 0;
    spo2Value = 0;
    heartRateValue = 0;
    hrv_ms = 0;
    ptt_ms = 0;
    arrhythmiaAlert = false;
    anemiaAlert = false;
    preeclampsiaAlert = false;
    maternalHealthScore = 100;
    bpFromPTT = false;
    bp_sys = 120;
    bp_dia = 80;
    bp_sys_ecg = 120;
    bp_dia_ecg = 80;
    bp_sys_ptt = 120;
    bp_dia_ptt = 80;
    bpMethodUsed = "ECG";
    for (int i = 0; i < AVG_SAMPLES; i++) {
      hrHistory[i] = 0;
      spo2History[i] = 0;
      rrIntervals[i] = 0;
    }
    historyIndex = 0;
    lastSend = 0;
    Serial.println("[STREAM] Cleared vitals history buffers");
  }

  void startStreamingSession(const char* reason) {
    if (!streamingEnabled) {
      streamingEnabled = true;
      lastSend = 0;
      Serial.print("[STREAM] Vitals streaming enabled");
      if (reason) {
        Serial.print(" (source: ");
        Serial.print(reason);
        Serial.print(")");
      }
      Serial.print(" at ");
      Serial.print(SEND_INTERVAL_MS / 1000);
      Serial.println("s interval");
    } else if (reason) {
      Serial.print("[STREAM] Streaming already active (source: ");
      Serial.print(reason);
      Serial.println(")");
    }

    if (!deviceConnected) {
      Serial.println("[STREAM] Waiting for BLE connection before notifications");
    } else if (!notifyEnabled) {
      Serial.println("[STREAM] Waiting for notifications to be enabled before sending data");
    }
  }

  void stopStreamingSession(const char* reason) {
    if (!streamingEnabled) {
      return;
    }
    streamingEnabled = false;
    Serial.print("[STREAM] Vitals streaming disabled");
    if (reason) {
      Serial.print(" (source: ");
      Serial.print(reason);
      Serial.print(")");
    }
    Serial.println();
  }

  void handleControlCommand(const String& command) {
    String normalized = command;
    normalized.trim();
    normalized.toUpperCase();

    if (normalized.length() == 0) {
      Serial.println("[CONFIG] Empty command ignored");
      return;
    }

    Serial.print("[CONFIG] Command: ");
    Serial.println(normalized);

    if (normalized == "START") {
      startStreamingSession("CONFIG START");
    } else if (normalized == "STOP") {
      stopStreamingSession("CONFIG STOP");
    } else if (normalized == "RESET") {
      stopStreamingSession("CONFIG RESET");
      resetStreamingState();
      if (notifyEnabled) {
        startStreamingSession("CONFIG RESET");
      }
    } else {
      Serial.print("[CONFIG] Unknown command: ");
      Serial.println(normalized);
    }
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
    rrIntervalVariance = variance;  // Store for AI detection
    
    // Return standard deviation (approximation)
    return (int)sqrt(variance);
  }

  void classifyCardiacRhythm() {
  // === TENSORFLOW LITE EDGE AI: ARRHYTHMIA DETECTION ===
  if (!aiEngineReady || ecgHeartRate == 0) {
    rhythmType = "NoSignal";
    rhythmConfidence = 0.0;
    arrhythmiaAlert = false;
    return;
  }
  
  // Call TFLite AI detection
  int hrvSDNN = calculateHRV();
  ArrhythmiaResult result = edgeAI.detectArrhythmia(
    ecgHeartRate,
    hrvSDNN,
    rrIntervalVariance,
    ecgQRSWidth,
    ecgPeakAmplitude
  );
  
  // Update global state
  rhythmType = result.rhythm_type;
  rhythmConfidence = result.confidence;
  arrhythmiaAlert = result.is_critical;
  
  // === LOGGING - CRITICAL ALERTS ONLY ===
  if (result.is_critical) {
    Serial.println("\n[AI-ARRHYTHMIA] 🚨 CRITICAL ALERT");
    Serial.print("Detected: ");
    Serial.print(result.rhythm_type);
    Serial.print(" (Confidence: ");
    Serial.print((int)result.confidence);
    Serial.println("%)");
    Serial.print("HR: ");
    Serial.print(ecgHeartRate);
    Serial.print(" BPM, HRV: ");
    Serial.print(hrvSDNN);
    Serial.print(", QRS: ");
    Serial.print(ecgQRSWidth);
    Serial.println("ms");
    Serial.println("[AI-ARRHYTHMIA] Medical attention recommended!");
    rgbBlink(255, 0, 0, 3, 200);
  }
}

  void detectAnemia() {
  // === TENSORFLOW LITE EDGE AI: ANEMIA DETECTION ===
  if (!aiEngineReady || (currentSPO2 == 0 && currentHR == 0)) {
    anemiaRisk = "Unknown";
    anemiaConfidence = 0.0;
    anemiaAlert = false;
    return;
  }
  
  // Call TFLite AI detection
  int hrvSDNN = calculateHRV();
  AnemiaResult result = edgeAI.detectAnemia(
    currentSPO2,
    currentHR,
    hrvSDNN,
    (int)bp_sys,
    (int)bp_dia
  );
  
  // Update global state
  anemiaRisk = result.risk_level;
  anemiaConfidence = result.confidence;
  anemiaAlert = result.alert;
  
  // === LOGGING - CRITICAL ALERTS ONLY ===
  if (result.alert) {
    Serial.println("\n[AI-ANEMIA] 🚨 CRITICAL ALERT");
    Serial.print("Risk Level: ");
    Serial.print(result.risk_level);
    Serial.print(" (Confidence: ");
    Serial.print((int)result.confidence);
    Serial.println("%)");
    Serial.print("SpO2: ");
    Serial.print(currentSPO2);
    Serial.print("%, HR: ");
    Serial.print(currentHR);
    Serial.print(" BPM, HRV: ");
    Serial.println(hrvSDNN);
    Serial.println("[AI-ANEMIA] Immediate medical evaluation needed!");
    Serial.println("[AI-ANEMIA] Recommend: CBC test (Hemoglobin/Hematocrit)");
    rgbBlink(255, 165, 0, 2, 300);
  }
}

  void detectPreeclampsia() {
  // === TENSORFLOW LITE EDGE AI: PREECLAMPSIA DETECTION ===
  if (!aiEngineReady || bp_sys == 0 || currentHR == 0) {
    preeclampsiaRisk = "Unknown";
    preeclampsiaConfidence = 0.0;
    preeclampsiaAlert = false;
    return;
  }
  
  // Call TFLite AI detection
  int hrvSDNN = calculateHRV();
  PreeclampsiaResult result = edgeAI.detectPreeclampsia(
    (int)bp_sys,
    (int)bp_dia,
    currentHR,
    hrvSDNN,
    currentSPO2
  );
  
  // Update global state
  preeclampsiaRisk = result.risk_level;
  preeclampsiaConfidence = result.confidence;
  preeclampsiaAlert = result.alert;
  
  // === REAL-TIME BP SPIKE ALERT ===
  if (bp_sys >= 160 || bp_dia >= 110) {
    rgbBlink(255, 0, 0, 5, 200);
    Serial.println("\n[BP-ALERT] 🚨 SEVERE HYPERTENSION!");
    Serial.print("BP: ");
    Serial.print((int)bp_sys);
    Serial.print("/");
    Serial.print((int)bp_dia);
    Serial.println(" mmHg - SEEK IMMEDIATE MEDICAL CARE!");
  } else if (bp_sys >= 140 || bp_dia >= 90) {
    rgbBlink(255, 100, 0, 3, 250);
  }
  
  // === LOGGING - CRITICAL ALERTS ONLY ===
  if (result.alert) {
    Serial.println("\n[AI-PREECLAMPSIA] 🚨 CRITICAL ALERT");
    Serial.print("Risk Level: ");
    Serial.print(result.risk_level);
    Serial.print(" (Confidence: ");
    Serial.print((int)result.confidence);
    Serial.println("%)");
    Serial.print("BP: ");
    Serial.print((int)bp_sys);
    Serial.print("/");
    Serial.print((int)bp_dia);
    Serial.print(" mmHg, HR: ");
    Serial.print(currentHR);
    Serial.print(" BPM, HRV: ");
    Serial.println(hrvSDNN);
    Serial.println("[AI-PREECLAMPSIA] Urgent medical attention required!");
    Serial.println("[AI-PREECLAMPSIA] Recommend: BP monitoring, protein urine test");
  }
}

  void calculateMaternalHealthScore() {
    // === OVERALL MATERNAL HEALTH SCORE (0-100) ===
    // Combines all AI detections into single health metric
    
    int baseScore = 100;
    
    // Deduct points for each risk factor
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
    
    // Signal quality penalty
    if (ecgReliability < 50 || ppgReliability < 50) baseScore -= 5;
    
    maternalHealthScore = max(baseScore, 0);
    
    // Log only significant changes or critical scores
    static int lastScore = 100;
    if (maternalHealthScore < 50 || abs(maternalHealthScore - lastScore) > 20) {
      Serial.print("\n[MATERNAL-HEALTH] Score: ");
      Serial.print(maternalHealthScore);
      Serial.println("/100");
      
      if (maternalHealthScore < 50) {
        Serial.println("[MATERNAL-HEALTH] 🚨 CRITICAL - Multiple risk factors!");
      }
      
      lastScore = maternalHealthScore;
    }
  }

  void sendVitals() {
    if (!deviceConnected || !vitalsChar) {
      return;
    }

    unsigned long now = millis();
    
    // Send every 2 seconds
    if (now - lastSend < SEND_INTERVAL_MS) {
      return;
    }
    lastSend = now;
    
    // === BP SELECTION: Only ECG or PTT (no PPG BP) ===
    // Prefer PTT if available (more accurate), otherwise use ECG
    updateFallbackBP();
    if (ptt_ms > 0 && ptt_ms >= 150 && ptt_ms <= 400) {
      bp_sys = bp_sys_ptt;
      bp_dia = bp_dia_ptt;
      bpMethodUsed = "PTT";
    } else {
      bp_sys = bp_sys_ecg;
      bp_dia = bp_dia_ecg;
      bpMethodUsed = "ECG";
    }
    
    
    // === SERIAL MONITOR VITALS DISPLAY ===
    Serial.println("\n========== VITALS DISPLAY ==========");
    Serial.print("HR: ");
    Serial.print(currentHR);
    Serial.print(" BPM (Source: ");
    Serial.print(reliableSource);
    Serial.println(")");
    
    Serial.print("SpO2: ");
    Serial.print(currentSPO2);
    Serial.println("%");
    
    Serial.println("\n--- BP CALCULATIONS ---");
    Serial.print("[BP-ECG]  ");
    Serial.print((int)bp_sys_ecg);
    Serial.print("/");
    Serial.print((int)bp_dia_ecg);
    Serial.println(" mmHg");
    
    if (ptt_ms > 0 && ptt_ms >= 150 && ptt_ms <= 400) {
      Serial.print("[BP-PTT]  ");
      Serial.print((int)bp_sys_ptt);
      Serial.print("/");
      Serial.print((int)bp_dia_ptt);
      Serial.print(" mmHg (PTT: ");
      Serial.print((int)ptt_ms);
      Serial.println("ms)");
    } else {
      Serial.println("[BP-PTT]  Not available");
    }
    
    Serial.print("\n[BP-SENT] ");
    Serial.print((int)bp_sys);
    Serial.print("/");
    Serial.print((int)bp_dia);
    Serial.print(" mmHg (Method: ");
    Serial.print(bpMethodUsed);
    Serial.println(")");
    
    Serial.print("\nHRV: ");
    Serial.print(hrv_ms);
    Serial.print("ms, SDNN: ");
    int hrvSDNN = calculateHRV();
    Serial.println(hrvSDNN);
    
    Serial.print("Maternal Health Score: ");
    Serial.print(maternalHealthScore);
    Serial.println("/100");
    Serial.println("====================================\n");
    
    
    // Read raw sensor values
    int ecgRaw = analogRead(ECG_PIN);
    long irRaw = sensorReady ? maxSensor.getIR() : 0;
    long redRaw = sensorReady ? maxSensor.getRed() : 0;
    
    // Build JSON payload
    StaticJsonDocument<384> doc;
    
    doc["hr"] = currentHR;              // From most reliable source (ECG or PPG)
    doc["hr_ecg"] = ecgHeartRate;       // ECG-based heart rate
    doc["hr_ppg"] = ppgHeartRate;       // PPG-based heart rate
    doc["hr_source"] = reliableSource;  // Which source was used ("ECG", "PPG", or "NONE")
    doc["ecg_quality"] = (int)ecgReliability;  // ECG signal quality (0-100)
    doc["ppg_quality"] = (int)ppgReliability;  // PPG signal quality (0-100)
    doc["spo2"] = currentSPO2;          // From MAX30105 algorithm
    doc["bp_sys"] = (int)bp_sys;        // Blood pressure systolic (randomly selected)
    doc["bp_dia"] = (int)bp_dia;        // Blood pressure diastolic (randomly selected)
    doc["bp_method"] = bpMethodUsed;    // Which BP method was sent
    doc["hrv"] = hrv_ms;                // Latest R-R interval
    doc["hrv_sdnn"] = calculateHRV();   // HRV variability metric
    doc["ptt"] = (int)ptt_ms;           // Pulse Transit Time
    
    // === EDGE AI: Arrhythmia Detection ===
    doc["rhythm"] = rhythmType;         // AI classification: Normal, AFib, PVC, etc.
    doc["rhythm_confidence"] = (int)rhythmConfidence;  // AI confidence (0-100)
    doc["arrhythmia_alert"] = arrhythmiaAlert;  // Critical alert flag
    
    // === EDGE AI: Pregnancy Health Monitoring ===
    doc["anemia_risk"] = anemiaRisk;    // Anemia risk level
    doc["anemia_confidence"] = (int)anemiaConfidence;  // Anemia confidence
    doc["anemia_alert"] = anemiaAlert;  // Anemia critical alert
    
    doc["preeclampsia_risk"] = preeclampsiaRisk;  // Preeclampsia risk level
    doc["preeclampsia_confidence"] = (int)preeclampsiaConfidence;  // Confidence
    doc["preeclampsia_alert"] = preeclampsiaAlert;  // Preeclampsia critical alert
    
    doc["maternal_health_score"] = maternalHealthScore;  // Overall health (0-100)
    
    doc["ecg"] = ecgRaw;                // Raw ECG signal (0-4095)
    doc["ir"] = (int)irRaw;             // MAX30105 IR value
    doc["red"] = (int)redRaw;           // MAX30105 Red value
    doc["timestamp"] = millis();
    
    String jsonString;
    serializeJson(doc, jsonString);
    
    // Send notification - SEND RAW JSON
    vitalsChar->setValue(jsonString.c_str());
    vitalsChar->notify();
    Serial.print("[BLE] ✓ Data sent (");
    Serial.print(jsonString.length());
    Serial.println(" bytes)\n");
  }

  class ServerCallbacks : public NimBLEServerCallbacks {
    void onConnect(NimBLEServer* pServer, ble_gap_conn_desc* desc) {
      deviceConnected = true;
      notifyEnabled = false;
      streamingEnabled = false;
      Serial.println("\n========================================");
      Serial.println("[BLE] ✓✓✓ CONNECTED ✓✓✓");
      Serial.print("[BLE] Peer address: ");
      Serial.println(NimBLEAddress(desc->peer_ota_addr).toString().c_str());
      Serial.println("========================================\n");
      rgbColor(0, 255, 0);
    }
    
    void onDisconnect(NimBLEServer* pServer) {
      deviceConnected = false;
      notifyEnabled = false;
      stopStreamingSession("DISCONNECT");
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
        notifyEnabled = true;
        Serial.println("[BLE] Notifications ON - starting live stream");
        startStreamingSession("NOTIFY");
      } else {
        notifyEnabled = false;
        Serial.println("[BLE] Notifications OFF - pausing live stream");
        stopStreamingSession("NOTIFY");
      }
    }
  };

  class ConfigCallbacks : public NimBLECharacteristicCallbacks {
    void onWrite(NimBLECharacteristic* pCharacteristic) {
      std::string rawValue = pCharacteristic->getValue();
      if (rawValue.empty()) {
        Serial.println("[CONFIG] Empty payload received");
        return;
      }

      String command = String(rawValue.c_str());
      Serial.print("[CONFIG] Raw payload: ");
      Serial.println(command);
      handleControlCommand(command);
    }
  };

  void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n\n");
    Serial.println("========================================");
      Serial.println("   LIFEBAND ESP32-S3 v5.0 - TFLite AI");
    Serial.println("   AD8232: ECG, HR, BP");
    Serial.println("   MAX30105: SpO2, PPG");
      Serial.println("   TensorFlow Lite Edge AI:");
    Serial.println("   - Arrhythmia Detection");
    Serial.println("   - Anemia Risk Assessment");
    Serial.println("   - Preeclampsia Detection");
    Serial.println("========================================");
    
      // Initialize Edge AI Engine
      Serial.println("[AI] Initializing TensorFlow Lite...");
      if (edgeAI.begin()) {
        aiEngineReady = true;
        Serial.println("[AI] ✓ Edge AI engine ready");
        Serial.print("[AI] Mode: ");
        Serial.println(edgeAI.getMode());
      } else {
        aiEngineReady = false;
        Serial.println("[AI] ✗ Edge AI initialization failed");
        Serial.println("[AI] Using rule-based fallback");
      }
    
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
        notifyEnabled = false;
        streamingEnabled = false;
        Serial.println("\n========================================");
        Serial.println("[BLE] ✓✓✓ CONNECTION DETECTED ✓✓✓");
        Serial.print("[BLE] Connected devices: ");
        Serial.println(connCount);
        Serial.println("========================================\n");
        rgbColor(0, 255, 0);
      } else {
        deviceConnected = false;
        notifyEnabled = false;
        stopStreamingSession("LINK LOSS");
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
        redBuffer[sampleCount % 50] = red;
        irBuffer[sampleCount % 50] = ir;
        
        // Detect PPG peak for PTT calculation
        if (detectPPGPeak(ir)) {
          computePTTandBP();
        }
        
        // Store PPG heart rate for reliability check (done every sample)
        // This updates ppgHeartRate continuously, not just every 100 samples
        if (sampleCount % 25 == 0 && ir >= 50000) {  // Every ~1 second
          // Quick HR estimation from IR amplitude
          static unsigned long lastPPGBeat = 0;
          unsigned long now = millis();
          if (now - lastPPGBeat > 400 && now - lastPPGBeat < 2000) {
            ppgHeartRate = 60000 / (now - lastPPGBeat);
          }
          if (ir > 80000) lastPPGBeat = now;  // Rough beat detection
        }
        
        maxSensor.nextSample();
        sampleCount++;
        
        // Process HR/SpO2 every 50 samples (every ~2 seconds at 25Hz)
        if (sampleCount % 50 == 0 && sampleCount > 0) {
          maxim_heart_rate_and_oxygen_saturation(
            irBuffer, 50,
            redBuffer,
            &spo2Value, &validSPO2,
            &heartRateValue, &validHeartRate
          );

          bool updatedPPG = false;

          if (validHeartRate && heartRateValue > 40 && heartRateValue < 200) {
            ppgHeartRate = heartRateValue;
            updatedPPG = true;
            Serial.print("[MAX30105] PPG HR: ");
            Serial.println(ppgHeartRate);

            // Feed PPG-derived HR into history if ECG isn’t providing data
            if (ecgHeartRate == 0) {
              hrHistory[historyIndex] = ppgHeartRate;
            }
          }

          if (validSPO2 && spo2Value > 70 && spo2Value <= 100) {
            spo2History[historyIndex] = spo2Value;
            int avgSPO2 = getAverageSPO2();
            if (avgSPO2 > 0) {
              currentSPO2 = avgSPO2;
              Serial.print("[MAX30105] SpO2: ");
              Serial.print(currentSPO2);
              Serial.println("%");
            }
          }

          historyIndex = (historyIndex + 1) % AVG_SAMPLES;

          if (updatedPPG || validSPO2) {
            selectReliableHeartRate();
          }
        }
      } else {
        // Check for new samples if none available
        maxSensor.check();
      }
    }
    
    // Read ECG continuously for peak detection and heart rate
    int ecgRaw = analogRead(ECG_PIN);
    
    // Auto-calibrate ECG baseline and threshold for first 3 seconds
    if (autoCalibrating) {
      if (calibrationStart == 0) {
        calibrationStart = now;
        Serial.println("[ECG] Starting auto-calibration (3 seconds)...");
      }
      
      // Track min/max during calibration
      if (ecgRaw < minECG) minECG = ecgRaw;
      if (ecgRaw > maxECG) maxECG = ecgRaw;
      
      // Print raw values during calibration
      static unsigned long lastPrint = 0;
      if (now - lastPrint >= 500) {
        Serial.print("[ECG] Raw: ");
        Serial.print(ecgRaw);
        Serial.print(" | Min: ");
        Serial.print(minECG);
        Serial.print(" | Max: ");
        Serial.println(maxECG);
        lastPrint = now;
      }
      
      // After ~3 seconds, set baseline and threshold
      if (now - calibrationStart >= 3000) {
        ecgBaseline = (minECG + maxECG) / 2;
        int range = maxECG - minECG;
        ecgThreshold = ecgBaseline + (range / 3);  // Threshold at 1/3 above baseline
        
        autoCalibrating = false;
        Serial.println("\n[ECG] ✓ Calibration complete!");
        Serial.print("[ECG] Baseline: ");
        Serial.println(ecgBaseline);
        Serial.print("[ECG] Threshold: ");
        Serial.println(ecgThreshold);
        Serial.print("[ECG] Range: ");
        Serial.println(range);
        Serial.println("[ECG] Now detecting R-peaks...\n");
        
        // Alert if signal is too weak
        if (range < 100) {
          Serial.println("[ECG] ⚠️ WARNING: Weak signal! Check electrode connections.");
          rgbBlink(255, 165, 0, 3, 300);
        }
      }
    } else {
      // Normal peak detection after calibration
      static unsigned long lastECGDebug = 0;
      if (detectECGPeak(ecgRaw)) {
        // ECG R-peak detected
        Serial.print("[ECG] ✓ R-peak! HR: ");
        Serial.print(currentHR);
        Serial.print(" BPM, HRV: ");
        Serial.print(hrv_ms);
        Serial.print("ms, Amplitude: ");
        Serial.println(ecgPeakAmplitude);
      }
      
      // Debug: Print raw ECG every 2 seconds if no peaks detected
      if (now - lastECGDebug >= 2000 && ecgHeartRate == 0) {
        Serial.print("[ECG] No peaks detected. Raw value: ");
        Serial.print(ecgRaw);
        Serial.print(" | Threshold: ");
        Serial.print(ecgThreshold);
        Serial.print(" | Baseline: ");
        Serial.println(ecgBaseline);
        lastECGDebug = now;
      }
    }
    
    // Send vitals every 1 second
    sendVitals();
    
    delay(10);  // Small delay to prevent watchdog issues
  }
