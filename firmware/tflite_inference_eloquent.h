/**
 * TensorFlow Lite Inference Engine using EloquentTinyML
 * Real TensorFlow Lite Micro implementation for ESP32
 * 
 * Based on EloquentTinyML v3.x API
 */

#ifndef TFLITE_INFERENCE_ELOQUENT_H
#define TFLITE_INFERENCE_ELOQUENT_H

#include <Arduino.h>

// Model headers - MUST be included BEFORE TensorFlow headers
#include "models_h/arrhythmia_risk_model.h"
#include "models_h/anemia_risk_model.h"
#include "models_h/preeclampsia_risk_model.h"

// TensorFlow Lite for ESP32 (EloquentTinyML v3.x)
#include <tflm_esp32.h>
#include <eloquent_tinyml.h>

#define ARENA_SIZE 8192  // 8KB arena per model
#define TF_NUM_OPS 10    // Number of TensorFlow operations

// Model types
enum ModelType {
  MODEL_ARRHYTHMIA = 0,
  MODEL_ANEMIA = 1,
  MODEL_PREECLAMPSIA = 2
};

/**
 * TensorFlow Lite Inference Engine
 */
class TFLiteInferenceEngine {
private:
  ModelType current_model_type;
  bool initialized;
  
  // Eloquent TF Sequential models (v3.x API)
  Eloquent::TF::Sequential<TF_NUM_OPS, ARENA_SIZE> *arrhythmia_ml;
  Eloquent::TF::Sequential<TF_NUM_OPS, ARENA_SIZE> *anemia_ml;
  Eloquent::TF::Sequential<TF_NUM_OPS, ARENA_SIZE> *preeclampsia_ml;
  
public:
  TFLiteInferenceEngine() : 
    current_model_type(MODEL_ARRHYTHMIA),
    initialized(false),
    arrhythmia_ml(nullptr),
    anemia_ml(nullptr),
    preeclampsia_ml(nullptr) {
  }
  
  ~TFLiteInferenceEngine() {
    if (arrhythmia_ml) delete arrhythmia_ml;
    if (anemia_ml) delete anemia_ml;
    if (preeclampsia_ml) delete preeclampsia_ml;
  }
  
  /**
   * Initialize a specific model
   */
  bool initModel(ModelType type) {
    Serial.print("[TFLITE] Loading model type ");
    Serial.println(type);
    
    try {
      switch (type) {
        case MODEL_ARRHYTHMIA: {
          if (!arrhythmia_ml) {
            arrhythmia_ml = new Eloquent::TF::Sequential<TF_NUM_OPS, ARENA_SIZE>();
            arrhythmia_ml->setNumInputs(5);
            arrhythmia_ml->setNumOutputs(5);
            arrhythmia_ml->resolver.AddFullyConnected();
            arrhythmia_ml->resolver.AddSoftmax();
          }
          
          if (!arrhythmia_ml->begin(arrhythmia_risk_model_tflite).isOk()) {
            Serial.print("[TFLITE] ✗ Arrhythmia model failed: ");
            Serial.println(arrhythmia_ml->exception.toString());
            return false;
          }
          Serial.println("[TFLITE] ✓ Arrhythmia model loaded");
          return true;
        }
          
        case MODEL_ANEMIA: {
          if (!anemia_ml) {
            anemia_ml = new Eloquent::TF::Sequential<TF_NUM_OPS, ARENA_SIZE>();
            anemia_ml->setNumInputs(5);
            anemia_ml->setNumOutputs(4);
            anemia_ml->resolver.AddFullyConnected();
            anemia_ml->resolver.AddSoftmax();
          }
          
          if (!anemia_ml->begin(anemia_risk_model_tflite).isOk()) {
            Serial.print("[TFLITE] ✗ Anemia model failed: ");
            Serial.println(anemia_ml->exception.toString());
            return false;
          }
          Serial.println("[TFLITE] ✓ Anemia model loaded");
          return true;
        }
          
        case MODEL_PREECLAMPSIA: {
          if (!preeclampsia_ml) {
            preeclampsia_ml = new Eloquent::TF::Sequential<TF_NUM_OPS, ARENA_SIZE>();
            preeclampsia_ml->setNumInputs(5);
            preeclampsia_ml->setNumOutputs(4);
            preeclampsia_ml->resolver.AddFullyConnected();
            preeclampsia_ml->resolver.AddSoftmax();
          }
          
          if (!preeclampsia_ml->begin(preeclampsia_risk_model_tflite).isOk()) {
            Serial.print("[TFLITE] ✗ Preeclampsia model failed: ");
            Serial.println(preeclampsia_ml->exception.toString());
            return false;
          }
          Serial.println("[TFLITE] ✓ Preeclampsia model loaded");
          return true;
        }
          
        default:
          Serial.println("[TFLITE] ✗ Unknown model type");
          return false;
      }
    } catch (...) {
      Serial.println("[TFLITE] ✗ Exception during model init");
      return false;
    }
  }
  
  /**
   * Load a model for inference
   */
  bool loadModel(ModelType type) {
    current_model_type = type;
    
    // Model is already initialized in initModel()
    switch (type) {
      case MODEL_ARRHYTHMIA:
        return arrhythmia_ml != nullptr;
      case MODEL_ANEMIA:
        return anemia_ml != nullptr;
      case MODEL_PREECLAMPSIA:
        return preeclampsia_ml != nullptr;
      default:
        return false;
    }
  }
  
  /**
   * Run inference
   */
  bool invoke(float* input, int input_size, float* output, int output_size) {
    if (input_size != 5) {
      Serial.println("[TFLITE] ✗ Expected 5 inputs");
      return false;
    }
    
    try {
      switch (current_model_type) {
        case MODEL_ARRHYTHMIA: {
          if (!arrhythmia_ml) {
            Serial.println("[TFLITE] ✗ Arrhythmia model not loaded");
            return false;
          }
          
          // Run prediction
          if (!arrhythmia_ml->predict(input).isOk()) {
            Serial.print("[TFLITE] ✗ Prediction failed: ");
            Serial.println(arrhythmia_ml->exception.toString());
            return false;
          }
          
          // Copy output using the output() method
          for (int i = 0; i < output_size && i < 5; i++) {
            output[i] = arrhythmia_ml->output(i);
          }
          break;
        }
          
        case MODEL_ANEMIA: {
          if (!anemia_ml) {
            Serial.println("[TFLITE] ✗ Anemia model not loaded");
            return false;
          }
          
          if (!anemia_ml->predict(input).isOk()) {
            Serial.print("[TFLITE] ✗ Prediction failed: ");
            Serial.println(anemia_ml->exception.toString());
            return false;
          }
          
          for (int i = 0; i < output_size && i < 4; i++) {
            output[i] = anemia_ml->output(i);
          }
          break;
        }
          
        case MODEL_PREECLAMPSIA: {
          if (!preeclampsia_ml) {
            Serial.println("[TFLITE] ✗ Preeclampsia model not loaded");
            return false;
          }
          
          if (!preeclampsia_ml->predict(input).isOk()) {
            Serial.print("[TFLITE] ✗ Prediction failed: ");
            Serial.println(preeclampsia_ml->exception.toString());
            return false;
          }
          
          for (int i = 0; i < output_size && i < 4; i++) {
            output[i] = preeclampsia_ml->output(i);
          }
          break;
        }
          
        default:
          Serial.println("[TFLITE] ✗ Invalid model type");
          return false;
      }
      
      return true;
      
    } catch (...) {
      Serial.println("[TFLITE] ✗ Exception during inference");
      return false;
    }
  }
  
  /**
   * Get predicted class (argmax)
   */
  int getPredictedClass(float* output, int output_size) {
    int max_idx = 0;
    float max_val = output[0];
    
    for (int i = 1; i < output_size; i++) {
      if (output[i] > max_val) {
        max_val = output[i];
        max_idx = i;
      }
    }
    
    return max_idx;
  }
  
  /**
   * Get confidence of prediction (0-100)
   */
  float getConfidence(float* output, int output_size) {
    float max_prob = 0.0;
    
    for (int i = 0; i < output_size; i++) {
      if (output[i] > max_prob) {
        max_prob = output[i];
      }
    }
    
    return max_prob * 100.0;  // Convert to percentage
  }
  
  /**
   * Check if ready for inference
   */
  bool isReady() {
    return arrhythmia_ml != nullptr || 
           anemia_ml != nullptr || 
           preeclampsia_ml != nullptr;
  }
  
  /**
   * Free model memory
   */
  void freeModel() {
    if (arrhythmia_ml) { delete arrhythmia_ml; arrhythmia_ml = nullptr; }
    if (anemia_ml) { delete anemia_ml; anemia_ml = nullptr; }
    if (preeclampsia_ml) { delete preeclampsia_ml; preeclampsia_ml = nullptr; }
  }
};

#endif // TFLITE_INFERENCE_ELOQUENT_H
