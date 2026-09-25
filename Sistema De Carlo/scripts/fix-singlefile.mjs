// Protege o HTML único da demo: bibliotecas (ex.: planilhas) têm textos como
// "<!--", "<script" e "</script" dentro do código, que confundem o leitor de HTML.
import fs from 'fs'
const file = 'dist-demo/index.html'
const html = fs.readFileSync(file, 'utf8')
const openTag = '<script type="module" crossorigin>'
const start = html.indexOf(openTag)
const end = html.lastIndexOf('</script>')
if (start < 0 || end < start) throw new Error('script principal não encontrado')
const body = html.slice(start + openTag.length, end)
  .replace(/<!--/g, '\\x3C!--')
  .replace(/<(\/?)script/gi, '\\x3C$1script')
fs.writeFileSync(file, html.slice(0, start + openTag.length) + body + html.slice(end))
console.log('demo protegida')
