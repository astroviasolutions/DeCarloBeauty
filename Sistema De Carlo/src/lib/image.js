/** Reduz uma foto para caber no armazenamento (JPEG ~640px) */
export function compressImage(file, max = 720, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      c.toBlob((blob) => {
        if (!blob) return reject(new Error('Não foi possível ler a foto'))
        const fr = new FileReader()
        fr.onload = () => resolve({ blob, dataUrl: fr.result })
        fr.readAsDataURL(blob)
      }, 'image/jpeg', quality)
    }
    img.onerror = () => reject(new Error('Arquivo de imagem inválido'))
    img.src = url
  })
}
