// In-page confirmation. Replaces window.confirm(), which blocks the page and
// cannot be styled or translated.
let dialog;
export function benchConfirm(message, okLabel = '确认') {
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'bench-dialog';
    dialog.innerHTML = '<form method="dialog"><p id="bench-dialog-text"></p><div class="dialog-actions"><button value="cancel">取消</button><button value="ok" class="primary" id="bench-dialog-ok"></button></div></form>';
    document.body.append(dialog);
  }
  dialog.querySelector('#bench-dialog-text').textContent = message;
  dialog.querySelector('#bench-dialog-ok').textContent = okLabel;
  dialog.returnValue = '';
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
    dialog.showModal();
    dialog.querySelector('#bench-dialog-ok').focus();
  });
}
