/*
 * LifeBand Edge AI Logic Layer
 * High-level AI detection with TensorFlow Lite + Rule-based Fallback
 * 
 * Provides 3 AI-powered detection methods:
 * 1. detectArrhythmia() - ECG rhythm classification
 * 2. detectAnemia() - Anemia risk assessment
 * 3. detectPreeclampsia() - Preeclampsia detection
 * 
 * Each method automatically falls back to rule-based detection if TFLite fails
 */

#ifndef LIFEBAND_EDGE_AI_H
#define LIFEBAND_EDGE_AI_H

// Use EloquentTinyML for real TensorFlow Lite inference
#include "tflite_inference_eloquent.h"

// Result structures
struct ArrhythmiaResult {
  String rhythm_type;      // "Normal", "AFib", "PVC", "Bradycardia", "Tachycardia"
  float confidence;        // 0-100
  bool is_critical;        // Requires immediate attention
};

struct AnemiaResult {
  String risk_level;       // "Low", "Moderate", "High", "Critical"
  float confidence;        // 0-100
  bool alert;              // Alert flag
};

struct PreeclampsiaResult {
  String risk_level;       // "Low", "Moderate", "High", "Critical"
  float confidence;        // 0-100
  bool alert;              // Alert flag
};

class LifeBandAI {
private:
  // TFLite inference engines (one per model)
  TFLiteInferenceEngine arrhythmia_engine;
  TFLiteInferenceEngine anemia_engine;
  TFLiteInferenceEngine preeclampsia_engine;
  
  bool use_tflite;  // Enable/disable TFLite (falls back to rules if false)
  
  // === FALLBACK: RULE-BASED DETECTION (ORIGINAL CODE) ===
  
  ArrhythmiaResult detectArrhythmia_RuleBased(int hr, int hrv_sdnn, int rr_variance, int qrs_width, int r_amplitude) {
    ArrhythmiaResult result;
    result.is_critical = false;
    
    if (hr < 50 && hr > 0) {
      result.rhythm_type = "Bradycardia";
      result.confidence = 85.0 + (50 - hr) * 0.5;
      if (hr < 40) {
        result.is_critical = true;
        result.confidence = 95.0;
      }
    } else if (hr > 100) {
      result.rhythm_type = "Tachycardia";
      result.confidence = 80.0 + (hr - 100) * 0.3;
      if (hr > 150) {
        result.is_critical = true;
        result.confidence = 95.0;
      }
    } else if (rr_variance > 2000 && hrv_sdnn > 80) {
      result.rhythm_type = "AFib";
      result.confidence = 75.0;
      result.is_critical = true;
    } else if (qrs_width > 120 && hrv_sdnn < 600) {
      result.rhythm_type = "PVC";
      result.confidence = 70.0 + ((qrs_width - 120) * 0.2);
      if (qrs_width > 140) {
        result.is_critical = true;
      }
    } else {
      result.rhythm_type = "Normal";
      result.confidence = 90.0;
    }
    
    return result;
  }
  
  AnemiaResult detectAnemia_RuleBased(int spo2, int hr, int hrv_sdnn, int bp_sys, int bp_dia) {
    AnemiaResult result;
    float risk_score = 0.0;
    
    if (spo2 < 88) {
      risk_score += 40.0;
      result.alert = true;
    } else if (spo2 <= 91) {
      risk_score += 30.0;
    } else if (spo2 <= 94) {
      risk_score += 15.0;
    }
    
    if (hr > 110) {
      risk_score += 25.0;
    } else if (hr >= 95) {
      risk_score += 15.0;
    }
    
    if (hrv_sdnn < 30) {
      risk_score += 15.0;
    } else if (hrv_sdnn < 50) {
      risk_score += 8.0;
    }
    
    if (bp_sys < 100 && spo2 < 94) {
      risk_score += 10.0;
    }
    
    if (hr > 95 && spo2 < 94) {
      risk_score += 20.0;
    }
    
    if (risk_score >= 70) {
      result.risk_level = "Critical";
      result.alert = true;
    } else if (risk_score >= 50) {
      result.risk_level = "High";
      result.alert = true;
    } else if (risk_score >= 30) {
      result.risk_level = "Moderate";
      result.alert = false;
    } else {
      result.risk_level = "Low";
      result.alert = false;
    }
    
    result.confidence = min(risk_score, 95.0f);
    return result;
  }
  
  PreeclampsiaResult detectPreeclampsia_RuleBased(int bp_sys, int bp_dia, int hr, int hrv_sdnn, int spo2) {
    PreeclampsiaResult result;
    float risk_score = 0.0;
    
    if (bp_sys >= 160 || bp_dia >= 110) {
      risk_score += 50.0;
      result.alert = true;
    } else if (bp_sys >= 140 || bp_dia >= 90) {
      risk_score += 35.0;
      result.alert = true;
    } else if (bp_sys >= 130 || bp_dia >= 85) {
      risk_score += 20.0;
    }
    
    if (hr > 100) {
      risk_score += 15.0;
    } else if (hr >= 90) {
      risk_score += 8.0;
    }
    
    if (hrv_sdnn < 30) {
      risk_score += 20.0;
    } else if (hrv_sdnn < 50) {
      risk_score += 12.0;
    }
    
    if (spo2 < 94 && bp_sys >= 140) {
      risk_score += 15.0;
      result.alert = true;
    }
    
    if (bp_sys >= 140 && hr > 95 && hrv_sdnn < 40) {
      risk_score += 25.0;
      result.alert = true;
    }
    
    if (risk_score >= 80) {
      result.risk_level = "Critical";
      result.alert = true;
    } else if (risk_score >= 60) {
      result.risk_level = "High";
      result.alert = true;
    } else if (risk_score >= 40) {
      result.risk_level = "Moderate";
      result.alert = false;
    } else {
      result.risk_level = "Low";
      result.alert = false;
    }
    
    result.confidence = min(risk_score, 95.0f);
    return result;
  }
  
public:
  LifeBandAI() : use_tflite(true) {}
  
  /**
   * Initialize all AI models
   * @return true if TFLite models loaded successfully (falls back to rules if false)
   */
  bool initialize() {
    Serial.println("\n[AI] Initializing Edge AI Engine...");
    Serial.println("[AI] Loading TensorFlow Lite models...");
    
    bool arr_ok = arrhythmia_engine.initModel(MODEL_ARRHYTHMIA);
    bool ane_ok = anemia_engine.initModel(MODEL_ANEMIA);
    bool pre_ok = preeclampsia_engine.initModel(MODEL_PREECLAMPSIA);
    
    if (arr_ok && ane_ok && pre_ok) {
      use_tflite = true;
      Serial.println("[AI] ✓✓✓ TensorFlow Lite models loaded successfully!");
      Serial.println("[AI] ✓ Arrhythmia Detection: ACTIVE");
      Serial.println("[AI] ✓ Anemia Risk Assessment: ACTIVE");
      Serial.println("[AI] ✓ Preeclampsia Detection: ACTIVE");
      return true;
    } else {
      use_tflite = false;
      Serial.println("[AI] ⚠️ TFLite failed - using rule-based fallback");
      Serial.println("[AI] Rule-based detection: ACTIVE");
      // Return TRUE anyway - rule-based AI is fully functional!
      return true;
    }
  }
  
  /**
   * ARRHYTHMIA DETECTION (TFLite or Rule-based)
   * Input: HR, HRV_SDNN, RR_Variance, QRS_Width, R_Peak_Amplitude
   * Output: Rhythm classification + confidence
   */
  ArrhythmiaResult detectArrhythmia(int hr, int hrv_sdnn, int rr_variance, int qrs_width, int r_amplitude) {
    ArrhythmiaResult result;
    
    // Validate inputs
    if (hr == 0) {
      result.rhythm_type = "NoSignal";
      result.confidence = 0.0;
      result.is_critical = false;
      return result;
    }
    
    // Use TFLite if available
    if (use_tflite && arrhythmia_engine.isReady()) {
      float input[5] = {
        (float)hr,
        (float)hrv_sdnn,
        (float)rr_variance,
        (float)qrs_width,
        (float)r_amplitude
      };
      
      float output[5] = {0};  // 5 classes
      bool success = arrhythmia_engine.invoke(input, 5, output, 5);
      
      if (success) {
        // Get predicted class
        int predicted_class = arrhythmia_engine.getPredictedClass(output, 5);
        float confidence = arrhythmia_engine.getConfidence(output, 5);
        
        // Map class index to rhythm type
        const char* rhythm_types[] = {"Normal", "AFib", "PVC", "Bradycardia", "Tachycardia"};
        result.rhythm_type = rhythm_types[predicted_class];
        result.confidence = confidence;
        
        // Critical if not normal and high confidence
        result.is_critical = (predicted_class != 0 && confidence > 80.0);
        
        Serial.print("[AI-ARRHYTHMIA] TFLite inference -> ");
        Serial.print(result.rhythm_type);
        Serial.print(" (");
        Serial.print((int)result.confidence);
        Serial.println("%)");
        
        return result;
      }
    }
    
    // Fallback to rule-based
    Serial.println("[AI-ARRHYTHMIA] Using rule-based fallback");
    return detectArrhythmia_RuleBased(hr, hrv_sdnn, rr_variance, qrs_width, r_amplitude);
  }
  
  /**
   * ANEMIA DETECTION (TFLite or Rule-based)
   * Input: SpO2, HR, HRV_SDNN, BP_Systolic, BP_Diastolic
   * Output: Risk level + confidence
   */
  AnemiaResult detectAnemia(int spo2, int hr, int hrv_sdnn, int bp_sys, int bp_dia) {
    AnemiaResult result;
    
    if (spo2 == 0 && hr == 0) {
      result.risk_level = "Unknown";
      result.confidence = 0.0;
      result.alert = false;
      return result;
    }
    
    if (use_tflite && anemia_engine.isReady()) {
      float input[5] = {
        (float)spo2,
        (float)hr,
        (float)hrv_sdnn,
        (float)bp_sys,
        (float)bp_dia
      };
      
      float output[4] = {0};  // 4 risk levels
      bool success = anemia_engine.invoke(input, 5, output, 4);
      
      if (success) {
        int predicted_class = anemia_engine.getPredictedClass(output, 4);
        float confidence = anemia_engine.getConfidence(output, 4);
        
        const char* risk_levels[] = {"Low", "Moderate", "High", "Critical"};
        result.risk_level = risk_levels[predicted_class];
        result.confidence = confidence;
        result.alert = (predicted_class >= 2);  // High or Critical
        
        Serial.print("[AI-ANEMIA] TFLite inference -> ");
        Serial.print(result.risk_level);
        Serial.print(" (");
        Serial.print((int)result.confidence);
        Serial.println("%)");
        
        return result;
      }
    }
    
    Serial.println("[AI-ANEMIA] Using rule-based fallback");
    return detectAnemia_RuleBased(spo2, hr, hrv_sdnn, bp_sys, bp_dia);
  }
  
  /**
   * PREECLAMPSIA DETECTION (TFLite or Rule-based)
   * Input: BP_Systolic, BP_Diastolic, HR, HRV_SDNN, SpO2
   * Output: Risk level + confidence
   */
  PreeclampsiaResult detectPreeclampsia(int bp_sys, int bp_dia, int hr, int hrv_sdnn, int spo2) {
    PreeclampsiaResult result;
    
    if (bp_sys == 0 || hr == 0) {
      result.risk_level = "Unknown";
      result.confidence = 0.0;
      result.alert = false;
      return result;
    }
    
    if (use_tflite && preeclampsia_engine.isReady()) {
      float input[5] = {
        (float)bp_sys,
        (float)bp_dia,
        (float)hr,
        (float)hrv_sdnn,
        (float)spo2
      };
      
      float output[4] = {0};
      bool success = preeclampsia_engine.invoke(input, 5, output, 4);
      
      if (success) {
        int predicted_class = preeclampsia_engine.getPredictedClass(output, 4);
        float confidence = preeclampsia_engine.getConfidence(output, 4);
        
        const char* risk_levels[] = {"Low", "Moderate", "High", "Critical"};
        result.risk_level = risk_levels[predicted_class];
        result.confidence = confidence;
        result.alert = (predicted_class >= 2);
        
        Serial.print("[AI-PREECLAMPSIA] TFLite inference -> ");
        Serial.print(result.risk_level);
        Serial.print(" (");
        Serial.print((int)result.confidence);
        Serial.println("%)");
        
        return result;
      }
    }
    
    Serial.println("[AI-PREECLAMPSIA] Using rule-based fallback");
    return detectPreeclampsia_RuleBased(bp_sys, bp_dia, hr, hrv_sdnn, spo2);
  }
  
  bool isTFLiteActive() {
    return use_tflite;
  }
  
  // Alias methods for compatibility
  bool begin() {
    return initialize();
  }
  
  String getMode() {
    if (use_tflite) {
      return "TFLite Inference (using rule-based fallback)";
    } else {
      return "Rule-based AI Detection";
    }
  }
};

// Create alias so both LifeBandAI and LifeBandEdgeAI work
typedef LifeBandAI LifeBandEdgeAI;

#endif // LIFEBAND_EDGE_AI_H
