/*
 * TensorFlow Lite Micro Inference Engine for ESP32-S3
 * Optimized for LifeBand maternal health monitoring
 * 
 * Supports 3 models:
 * - Arrhythmia Detection
 * - Anemia Risk Assessment  
 * - Preeclampsia Detection
 */

#ifndef TFLITE_INFERENCE_H
#define TFLITE_INFERENCE_H

#include <TensorFlowLite_ESP32.h>
#include <tensorflow/lite/micro/all_ops_resolver.h>
#include <tensorflow/lite/micro/micro_error_reporter.h>
#include <tensorflow/lite/micro/micro_interpreter.h>
#include <tensorflow/lite/schema/schema_generated.h>

// Include generated model headers
#include "arrhythmia_risk_model.h"
#include "anemia_risk_model.h"
#include "preeclampsia_risk_model.h"

// Model types
enum ModelType {
  MODEL_ARRHYTHMIA = 0,
  MODEL_ANEMIA = 1,
  MODEL_PREECLAMPSIA = 2
};

class TFLiteInferenceEngine {
private:
  // TFLite components
  const tflite::Model* model;
  tflite::MicroInterpreter* interpreter;
  TfLiteTensor* input;
  TfLiteTensor* output;
  tflite::MicroErrorReporter micro_error_reporter;
  tflite::AllOpsResolver resolver;
  
  // Tensor arena (shared across all models)
  static constexpr int kTensorArenaSize = 16 * 1024;  // 16 KB
  uint8_t tensor_arena[kTensorArenaSize];
  
  ModelType current_model;
  bool initialized;
  
public:
  TFLiteInferenceEngine() : model(nullptr), interpreter(nullptr), 
                            input(nullptr), output(nullptr), 
                            initialized(false) {}
  
  ~TFLiteInferenceEngine() {
    if (interpreter != nullptr) {
      delete interpreter;
    }
  }
  
  /**
   * Initialize TFLite model
   * @param model_type: Which model to load (ARRHYTHMIA, ANEMIA, or PREECLAMPSIA)
   * @return true if successful
   */
  bool initModel(ModelType model_type) {
    current_model = model_type;
    
    // Load appropriate model from PROGMEM
    const unsigned char* model_data;
    unsigned int model_len;
    
    switch (model_type) {
      case MODEL_ARRHYTHMIA:
        model_data = arrhythmia_risk_model_tflite;
        model_len = arrhythmia_risk_model_tflite_len;
        Serial.println("[TFLite] Loading Arrhythmia model...");
        break;
      case MODEL_ANEMIA:
        model_data = anemia_risk_model_tflite;
        model_len = anemia_risk_model_tflite_len;
        Serial.println("[TFLite] Loading Anemia model...");
        break;
      case MODEL_PREECLAMPSIA:
        model_data = preeclampsia_risk_model_tflite;
        model_len = preeclampsia_risk_model_tflite_len;
        Serial.println("[TFLite] Loading Preeclampsia model...");
        break;
      default:
        Serial.println("[TFLite] ERROR: Invalid model type");
        return false;
    }
    
    // Map model from flash memory
    model = tflite::GetModel(model_data);
    if (model->version() != TFLITE_SCHEMA_VERSION) {
      Serial.print("[TFLite] ERROR: Model schema version ");
      Serial.print(model->version());
      Serial.print(" doesn't match supported version ");
      Serial.println(TFLITE_SCHEMA_VERSION);
      return false;
    }
    
    // Build interpreter
    if (interpreter != nullptr) {
      delete interpreter;
    }
    
    interpreter = new tflite::MicroInterpreter(
        model, resolver, tensor_arena, kTensorArenaSize, &micro_error_reporter);
    
    // Allocate tensors
    TfLiteStatus allocate_status = interpreter->AllocateTensors();
    if (allocate_status != kTfLiteOk) {
      Serial.println("[TFLite] ERROR: AllocateTensors() failed");
      return false;
    }
    
    // Get input/output tensors
    input = interpreter->input(0);
    output = interpreter->output(0);
    
    // Verify input dimensions
    if (input->dims->size != 2 || input->dims->data[1] != 5) {
      Serial.print("[TFLite] ERROR: Expected input shape [1, 5], got [");
      Serial.print(input->dims->data[0]);
      Serial.print(", ");
      Serial.print(input->dims->data[1]);
      Serial.println("]");
      return false;
    }
    
    // Verify output dimensions
    int expected_outputs = (model_type == MODEL_ARRHYTHMIA) ? 5 : 4;
    if (output->dims->data[1] != expected_outputs) {
      Serial.print("[TFLite] ERROR: Expected ");
      Serial.print(expected_outputs);
      Serial.print(" outputs, got ");
      Serial.println(output->dims->data[1]);
      return false;
    }
    
    Serial.print("[TFLite] ✓ Model loaded (");
    Serial.print(model_len);
    Serial.println(" bytes)");
    Serial.print("[TFLite] Arena used: ");
    Serial.print(interpreter->arena_used_bytes());
    Serial.print(" / ");
    Serial.print(kTensorArenaSize);
    Serial.println(" bytes");
    
    initialized = true;
    return true;
  }
  
  /**
   * Run inference
   * @param input_data: Float array of input features (size 5)
   * @param output_data: Float array to store output probabilities
   * @return Inference time in microseconds (0 if failed)
   */
  unsigned long invoke(float* input_data, float* output_data) {
    if (!initialized) {
      Serial.println("[TFLite] ERROR: Model not initialized");
      return 0;
    }
    
    // Copy input data to tensor
    for (int i = 0; i < 5; i++) {
      input->data.f[i] = input_data[i];
    }
    
    // Run inference
    unsigned long start = micros();
    TfLiteStatus invoke_status = interpreter->Invoke();
    unsigned long inference_time = micros() - start;
    
    if (invoke_status != kTfLiteOk) {
      Serial.println("[TFLite] ERROR: Invoke() failed");
      return 0;
    }
    
    // Copy output probabilities
    int output_size = (current_model == MODEL_ARRHYTHMIA) ? 5 : 4;
    for (int i = 0; i < output_size; i++) {
      output_data[i] = output->data.f[i];
    }
    
    return inference_time;
  }
  
  /**
   * Get predicted class index (argmax of output)
   */
  int getPredictedClass(float* output_probs) {
    int output_size = (current_model == MODEL_ARRHYTHMIA) ? 5 : 4;
    int max_index = 0;
    float max_value = output_probs[0];
    
    for (int i = 1; i < output_size; i++) {
      if (output_probs[i] > max_value) {
        max_value = output_probs[i];
        max_index = i;
      }
    }
    
    return max_index;
  }
  
  /**
   * Get confidence score (percentage)
   */
  float getConfidence(float* output_probs) {
    int output_size = (current_model == MODEL_ARRHYTHMIA) ? 5 : 4;
    float max_value = output_probs[0];
    
    for (int i = 1; i < output_size; i++) {
      if (output_probs[i] > max_value) {
        max_value = output_probs[i];
      }
    }
    
    return max_value * 100.0;  // Convert to percentage
  }
  
  bool isInitialized() {
    return initialized;
  }
};

#endif // TFLITE_INFERENCE_H
