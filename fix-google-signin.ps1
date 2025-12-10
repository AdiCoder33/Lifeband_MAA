# Quick Fix Script for Google Sign-In Production Issue

Write-Host "🔧 Fixing Google Sign-In for Production..." -ForegroundColor Cyan
Write-Host ""

Write-Host "📋 Your SHA Fingerprints:" -ForegroundColor Yellow
Write-Host "SHA-1:   5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25" -ForegroundColor Green
Write-Host "SHA-256: FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C" -ForegroundColor Green
Write-Host ""

Write-Host "✅ STEP 1: Add Fingerprints to Firebase Console" -ForegroundColor Cyan
Write-Host "   1. Go to: https://console.firebase.google.com/" -ForegroundColor White
Write-Host "   2. Select your project" -ForegroundColor White
Write-Host "   3. Settings → Project Settings → Your apps" -ForegroundColor White
Write-Host "   4. Click 'Add fingerprint' and paste SHA-1 above" -ForegroundColor White
Write-Host "   5. Click 'Add fingerprint' and paste SHA-256 above" -ForegroundColor White
Write-Host ""

$response = Read-Host "Have you added both fingerprints to Firebase Console? (y/n)"
if ($response -ne "y") {
    Write-Host "❌ Please add the fingerprints first, then run this script again." -ForegroundColor Red
    exit
}

Write-Host ""
Write-Host "✅ STEP 2: Download google-services.json" -ForegroundColor Cyan
Write-Host "   1. In Firebase Console → Project Settings → Your apps" -ForegroundColor White
Write-Host "   2. Click 'Download google-services.json'" -ForegroundColor White
Write-Host "   3. Save it and remember the location" -ForegroundColor White
Write-Host ""

$downloaded = Read-Host "Have you downloaded the updated google-services.json? (y/n)"
if ($downloaded -eq "y") {
    $sourcePath = Read-Host "Enter the full path to the downloaded google-services.json"
    if (Test-Path $sourcePath) {
        Copy-Item $sourcePath -Destination "android\app\google-services.json" -Force
        Write-Host "✓ google-services.json updated successfully!" -ForegroundColor Green
    } else {
        Write-Host "❌ File not found. Please copy it manually to: android\app\google-services.json" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "✅ STEP 3: Verify Web Client ID" -ForegroundColor Cyan
Write-Host "   1. Firebase Console → Authentication → Sign-in method" -ForegroundColor White
Write-Host "   2. Click 'Google' provider" -ForegroundColor White
Write-Host "   3. Copy the Web client ID (ends with .apps.googleusercontent.com)" -ForegroundColor White
Write-Host ""

$webClientId = Read-Host "Paste your Web Client ID here (or press Enter to skip)"
if ($webClientId) {
    if (Test-Path ".env") {
        $envContent = Get-Content ".env" -Raw
        if ($envContent -match "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=") {
            $envContent = $envContent -replace "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=.*", "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=$webClientId"
            Set-Content ".env" -Value $envContent -NoNewline
            Write-Host "✓ .env file updated with Web Client ID!" -ForegroundColor Green
        } else {
            Add-Content ".env" "`nEXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=$webClientId"
            Write-Host "✓ Web Client ID added to .env file!" -ForegroundColor Green
        }
    } else {
        Write-Host "⚠️  No .env file found. Creating one..." -ForegroundColor Yellow
        Copy-Item ".env.example" -Destination ".env"
        $envContent = Get-Content ".env" -Raw
        $envContent = $envContent -replace "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=.*", "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=$webClientId"
        Set-Content ".env" -Value $envContent -NoNewline
        Write-Host "✓ .env file created with Web Client ID!" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "🔨 STEP 4: Clean Build" -ForegroundColor Cyan
$clean = Read-Host "Do you want to clean the Android build now? (y/n)"
if ($clean -eq "y") {
    Write-Host "Cleaning Android build..." -ForegroundColor Yellow
    cd android
    .\gradlew clean
    cd ..
    Write-Host "✓ Build cleaned!" -ForegroundColor Green
}

Write-Host ""
Write-Host "✅ Setup Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 Next Steps:" -ForegroundColor Cyan
Write-Host "   To test locally (release mode):" -ForegroundColor White
Write-Host "     npx expo run:android --variant release" -ForegroundColor Yellow
Write-Host ""
Write-Host "   To build for production (EAS):" -ForegroundColor White
Write-Host "     eas build --platform android" -ForegroundColor Yellow
Write-Host ""
Write-Host "📖 For more details, see: FIREBASE_FINGERPRINTS.md" -ForegroundColor Cyan
