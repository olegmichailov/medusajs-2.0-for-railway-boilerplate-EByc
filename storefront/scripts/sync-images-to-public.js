const fs = require("fs")
const path = require("path")

// Откуда копируем: путь к папке с картинками в backend (скорее всего, Medusa backend/public/uploads)
const sourceDir = path.join(__dirname, "../../backend/public/uploads")

// Куда копируем: storefront/public/images
const targetDir = path.join(__dirname, "../public/images")

// Функция рекурсивной копии
function copyRecursiveSync(src, dest) {
  if (!fs.existsSync(src)) return

  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })

  fs.readdirSync(src).forEach((file) => {
    const srcFile = path.join(src, file)
    const destFile = path.join(dest, file)

    if (fs.lstatSync(srcFile).isDirectory()) {
      copyRecursiveSync(srcFile, destFile)
    } else {
      fs.copyFileSync(srcFile, destFile)
    }
  })
  console.log(`✅ Synced images from: ${src} → ${dest}`)
}

// Выполняем копирование
copyRecursiveSync(sourceDir, targetDir)
