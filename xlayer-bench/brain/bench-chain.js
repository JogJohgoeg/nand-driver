// Display-only RPC adapter. No wallet, signer, transaction or dynamic RPC URL.
export const PLANNED_SUPPLY = 4850702n;
export const READ_SELECTORS = {transistors:'0x6fbd1719',supplyCap:'0x8f770ad0',minted:'0x4f02c420',circuitInfo:'0x084d60f1'};
const address = value => /^0x[0-9a-fA-F]{40}$/.test(value ?? '') && !/^0x0{40}$/i.test(value);
const word = value => {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value ?? '')) throw Error('RPC未返回完整uint256 / incomplete uint256');
  return BigInt(value);
};
export async function readIdentity(config, fetchImpl = fetch) {
  if (config.processor == null && config.circuitId == null) return {status:'pending'};
  if (!address(config.processor) || (config.circuitId != null && (!/^\d+$/.test(String(config.circuitId)) || BigInt(config.circuitId) >= 1n<<256n)))
    throw Error('请配置真实处理器与电路号 / invalid deployment config');
  const supplyCapSelector=config.supplyCapSelector ?? READ_SELECTORS.supplyCap;
  const mintedSelector=config.mintedSelector ?? READ_SELECTORS.minted;
  if (supplyCapSelector!==READ_SELECTORS.supplyCap || mintedSelector!==READ_SELECTORS.minted)
    throw Error('Getter与已核验ABI不符 / unverified getter selector');
  const rpc = async (method, params) => {
    if (!['eth_chainId','eth_blockNumber','eth_getCode','eth_call'].includes(method)) throw Error('Read-only boundary');
    const r = await fetchImpl('https://rpc.xlayer.tech', {method:'POST',credentials:'omit',signal:AbortSignal.timeout(15000),
      headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
    if (!r.ok) throw Error(`RPC HTTP ${r.status}`);
    const data = await r.json();
    if (data.error || typeof data.result !== 'string') throw Error(data.error?.message ?? 'RPC缺少结果 / missing result');
    return data.result;
  };
  if (BigInt(await rpc('eth_chainId',[])) !== 196n) throw Error('RPC不是X Layer / wrong chain');
  const block = await rpc('eth_blockNumber',[]);
  if (!/^0x[\da-f]+$/i.test(block)) throw Error('Invalid block tag');
  if (!/^0x[\da-f]+$/i.test(await rpc('eth_getCode',[config.processor,block]))) throw Error('处理器没有合约代码 / no contract code');
  const call = (to,data) => rpc('eth_call',[{to,data},block]);
  const transWord = await call(config.processor, READ_SELECTORS.transistors);
  word(transWord);
  const transistors = '0x'+transWord.slice(-40);
  if (!address(transistors) || !/^0x0{24}/i.test(transWord)) throw Error('Invalid transistors address');
  const cap = word(await call(transistors, supplyCapSelector));
  let dimensions = null; // A deployed processor may not have its first tapeout yet.
  if (config.circuitId != null) {
    const info = await call(config.processor, READ_SELECTORS.circuitInfo+BigInt(config.circuitId).toString(16).padStart(64,'0'));
    if (!/^0x[\da-f]{256}$/i.test(info)) throw Error('电路不存在或尺寸返回无效 / invalid circuitInfo');
    dimensions = [0,1,2,3].map(i=>BigInt('0x'+info.slice(2+i*64,66+i*64)));
    if (dimensions.some(x=>x>0xffffffffn) || dimensions[1]===0n || dimensions[3]===0n) throw Error('Invalid circuit dimensions');
  }
  let minted = null, mintedError = null;
  // Supervisor verified minted(): cumulative NAND + LATCH, not outstanding
  // supply or a balance. Keep RPC failure distinct from a genuine zero.
  try {
    minted = word(await call(transistors,mintedSelector));
    if (minted > cap) throw Error('已铸读数超出上限 / minted exceeds cap');
  } catch (e) { minted = null; mintedError = e.message; }
  return {status:'read',block:String(BigInt(block)),transistors,cap:String(cap),matchesPlan:cap===PLANNED_SUPPLY,
    minted:minted==null?null:String(minted),mintedError,dimensions:dimensions?.map(String) ?? null,queriedAt:new Date().toISOString()};
}
