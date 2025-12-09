    # TensorFlow Lite Library Installation for Arduino IDE

## ⚠️ Important: Correct Library Name

The TensorFlow Lite library for ESP32 has a specific name in Arduino Library Manager.

---

## 📦 Install TensorFlow Lite for ESP32

### Method 1: Arduino Library Manager (Recommended)

1. **Open Arduino IDE**

2. **Go to Library Manager:**
   - Click: `Tools` → `Manage Libraries...`
   - Or use shortcut: `Ctrl+Shift+I`

3. **Search for the library:**
   - Type in search box: `TensorFlowLite ESP32`
   - OR search: `EloquentTinyML`

4. **Install ONE of these libraries:**

   **Option A: EloquentTinyML (Recommended - Easier)**
   - Publisher: Eloquent Arduino
   - Name: `EloquentTinyML`
   - Version: Latest (3.x or higher)
   - Click: **Install**
   
   **Option B: TensorFlowLite_ESP32**
   - Publisher: TensorFlow Authors
   - Name: `TensorFlowLite_ESP32`
   - Version: Latest
   - Click: **Install**

5. **Wait for installation** (may take 2-3 minutes)

6. **Restart Arduino IDE**

---

## 🔧 Which Library to Use?

### Option 1: EloquentTinyML ✅ RECOMMENDED

**Pros:**
- Easier to use
- Better ESP32 support
- Smaller compiled size
- Faster compilation
- Active maintenance

**Installation:**
```
Library Manager → Search "EloquentTinyML" → Install
```

**Then update your includes:**
```cpp
#include <EloquentTinyML.h>
#include <eloquent_tinyml/tensorflow.h>
```

---

### Option 2: Official TensorFlowLite_ESP32

**Pros:**
- Official TensorFlow library
- More features
- Better documentation

**Cons:**
- Larger size
- Slower compilation

**Installation:**
```
Library Manager → Search "TensorFlowLite_ESP32" → Install
```

**Includes (already set):**
```cpp
#include <TensorFlowLite_ESP32.h>
#include <tensorflow/lite/micro/all_ops_resolver.h>
```

---

## 🚀 Quick Fix: Try EloquentTinyML First

If you want the easiest path:

### Step 1: Install Library
1. Arduino IDE → Tools → Manage Libraries
2. Search: `EloquentTinyML`
3. Install latest version

### Step 2: Update tflite_inference.h

Replace the includes at the top with:

```cpp
#ifndef TFLITE_INFERENCE_H
#define TFLITE_INFERENCE_H

// Using EloquentTinyML (easier and lighter)
#include <EloquentTinyML.h>
#include <eloquent_tinyml/tensorflow.h>

// Include generated model headers
#include "arrhythmia_risk_model.h"
#include "anemia_risk_model.h"
#include "preeclampsia_risk_model.h"
```

### Step 3: Compile

Should compile without errors now!

---

## ❌ If Library Manager Doesn't Show Results

### Manual Installation (Advanced)

#### For EloquentTinyML:

1. Download ZIP from GitHub:
   ```
   https://github.com/eloquentarduino/EloquentTinyML/archive/refs/heads/main.zip
   ```

2. Arduino IDE:
   - Sketch → Include Library → Add .ZIP Library
   - Select downloaded ZIP file

#### For Official TensorFlow Lite:

1. Download ZIP:
   ```
   https://github.com/tensorflow/tflite-micro-arduino-examples/archive/refs/heads/main.zip
   ```

2. Arduino IDE:
   - Sketch → Include Library → Add .ZIP Library
   - Select downloaded ZIP file

---

## 🔍 Verify Installation

After installing, check if library is available:

1. Arduino IDE → Sketch → Include Library
2. Scroll through the list
3. Look for:
   - `EloquentTinyML` (recommended)
   - OR `TensorFlowLite_ESP32`

If you see it, installation succeeded! ✅

---

## 🎯 Compilation Test

### Test Code (Quick Check)

Create a new sketch and paste:

```cpp
// Test EloquentTinyML
#include <EloquentTinyML.h>

void setup() {
  Serial.begin(115200);
  Serial.println("TensorFlow Lite library installed successfully!");
}

void loop() {
  delay(1000);
}
```

**Click Verify (✓)**

- ✅ Compiles → Library installed correctly
- ❌ Error → Library not found, try manual installation

---

## 🛠️ Still Getting Errors?

### Error: "TensorFlowLite_ESP32.h: No such file"

**Solution:** Use EloquentTinyML instead

1. Install `EloquentTinyML` from Library Manager
2. Update `tflite_inference.h` includes to:
   ```cpp
   #include <EloquentTinyML.h>
   ```

### Error: "eloquent_tinyml/tensorflow.h: No such file"

**Solution:** Install EloquentTinyML library (not installed yet)

### Error: "all_ops_resolver.h: No such file"

**Solution:** Install `TensorFlowLite_ESP32` library (official one)

---

## 📋 Summary

**Current Status:** Your firmware expects TensorFlow Lite library

**Quick Fix:**
1. Install `EloquentTinyML` library (easier)
2. Update includes in `tflite_inference.h`
3. Compile should work

**Alternative:**
1. Install `TensorFlowLite_ESP32` library (official)
2. Includes already updated
3. Compile (may take longer)

---

## ✅ Next Steps After Installation

1. ✅ Library installed
2. ✅ Includes updated in `tflite_inference.h`
3. ✅ Header files copied to sketch folder
4. ✅ Compile firmware
5. ✅ Upload to ESP32-S3

**Ready to go!** 🚀

---

## 💡 Pro Tip

If you're new to TensorFlow Lite on Arduino:
- Start with `EloquentTinyML` (much easier)
- Switch to official library later if needed
- Both work with your firmware (just need different includes)

---

**Still stuck?** Check if ESP32 board is selected:
- Tools → Board → ESP32 Arduino → ESP32S3 Dev Module

The library needs ESP32 board selected to show up in Library Manager!
