import os

print('='* 60)
print('LIFEBAND Lightweight Model Generator')
print('='* 60)
print('Generating model headers...')
print('(No TensorFlow required - using rule-based AI)')
print('='* 60)

os.makedirs('models_h', exist_ok=True)

print('\n[1/3] Generating Arrhythmia Detection Model Header...')

def generate_c_header(model_name, description):
    header_path = f'models_h/{model_name}.h'
    model_data = bytearray()
    model_data.extend(b'TFL3')
    model_data.extend(b'\x00' * 1020)
    
    with open(header_path, 'w') as f:
        guard = model_name.upper() + '_H'
        f.write(f'#ifndef {guard}\n')
        f.write(f'#define {guard}\n\n')
        f.write(f'// Model: {description}\n')
        f.write(f'// NOTE: Placeholder - firmware uses rule-based AI\n\n')
        f.write('const unsigned char ')
        f.write(f'{model_name}_tflite[] ')
        f.write('__attribute__((aligned(16))) = {\n  ')
        for i, byte in enumerate(model_data):
            f.write(f'0x{byte:02x}')
            if i < len(model_data) - 1:
                f.write(',')
                if (i + 1) % 16 == 0:
                    f.write('\n  ')
                else:
                    f.write(' ')
        f.write('\n};\n\n')
        f.write(f'const unsigned int {model_name}_tflite_len = {len(model_data)};\n\n')
        f.write(f'#endif // {guard}\n')
    print(f'✓ {model_name}.h generated')
    return len(model_data)

arr_size = generate_c_header('arrhythmia_risk_model', 'Arrhythmia Detection')
print('\n[2/3] Generating Anemia Detection Model Header...')
ane_size = generate_c_header('anemia_risk_model', 'Anemia Risk Assessment')
print('\n[3/3] Generating Preeclampsia Detection Model Header...')
pre_size = generate_c_header('preeclampsia_risk_model', 'Preeclampsia Detection')

print('\n' + '='* 60)
print('SUCCESS! Model headers generated')
print('='* 60)
print(f'\nTotal Size: {(arr_size + ane_size + pre_size)/1024:.1f} KB')
print('\nNext: Copy models_h/*.h files to your firmware directory')
print('='* 60)
