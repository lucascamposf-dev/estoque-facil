import { estaOnline } from '../api';

// Lê um arquivo de imagem escolhido pelo usuário, redimensiona e compacta
// pra um data URL (base64) pronto pra salvar no produto.
// Offline, a foto fica guardada em base64 no IndexedDB até sincronizar -
// compacta mais forte pra não inchar o armazenamento local.
// Mesma lógica usada em CadastrarProduto e EditarProduto.
export function redimensionarFoto(arquivo) {
  return new Promise((resolve, reject) => {
    const tamanhoMax = estaOnline() ? 800 : 500;
    const qualidade = estaOnline() ? 0.75 : 0.6;

    const imagem = new Image();
    const leitorTemp = new FileReader();

    leitorTemp.onload = (evento) => {
      imagem.onload = () => {
        let { width, height } = imagem;
        if (width > height && width > tamanhoMax) {
          height = Math.round((height * tamanhoMax) / width);
          width = tamanhoMax;
        } else if (height > tamanhoMax) {
          width = Math.round((width * tamanhoMax) / height);
          height = tamanhoMax;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(imagem, 0, 0, width, height);

        resolve(canvas.toDataURL('image/jpeg', qualidade));
      };
      imagem.onerror = reject;
      imagem.src = evento.target.result;
    };
    leitorTemp.onerror = reject;
    leitorTemp.readAsDataURL(arquivo);
  });
}
