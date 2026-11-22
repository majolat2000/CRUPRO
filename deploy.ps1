# deploy.ps1 — 1-Click Deploy to GitHub and Firebase Hosting
param (
    [string]$CommitMessage = ""
)

$ErrorActionPreference = "Stop"

try {
    # 1. Commit any pending changes if a message was provided
    if ($CommitMessage -ne "") {
        Write-Host "📝 Staging and committing changes..." -ForegroundColor Cyan
        git add .
        git commit -m "$CommitMessage"
    }

    # 2. Push to GitHub
    Write-Host "🚀 Pushing to GitHub (https://github.com/majolat2000/CRUPRO.git)..." -ForegroundColor Cyan
    git push origin main
    Write-Host "✅ GitHub push complete!" -ForegroundColor Green

    # 3. Deploy to Firebase Hosting
    Write-Host "🌐 Deploying to Firebase Hosting (https://cruprosite.web.app)..." -ForegroundColor Cyan
    $env:NODE_OPTIONS = "--dns-result-order=ipv4first --use-system-ca"
    npx -y firebase-tools@latest deploy --only hosting

    Write-Host "🎉 Successfully deployed! Your site is live at:" -ForegroundColor Green
    Write-Host "👉 https://cruprosite.web.app" -ForegroundColor Yellow
    Write-Host "👉 https://cruprosite.firebaseapp.com" -ForegroundColor Yellow

} catch {
    Write-Host "❌ Deployment encountered an error: $_" -ForegroundColor Red
    Write-Host "💡 If credentials expired, run: npx firebase-tools login --reauth" -ForegroundColor Yellow
}
