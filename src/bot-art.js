// One shared silhouette, based on the supplied round Grok Bot reference.
// Finishes change the surface only; sphere and eye geometry are identical.
export const botFinishes={
 pearl:{light:'#ffffff',mid:'#e9eaeb',shade:'#9b9fa0',gloss:'#ffffff',opacity:.2},
 violet:{light:'#f4eaff',mid:'#b5a0ed',shade:'#60528f',gloss:'#c3f1ff',opacity:.28},
 lime:{light:'#f0ffbf',mid:'#c2eb78',shade:'#6d9347',gloss:'#ffffff',opacity:.12},
 copper:{light:'#fff0d6',mid:'#d4a17e',shade:'#855a45',gloss:'#ffe2bd',opacity:.3},
 cobalt:{light:'#bddeff',mid:'#6a9de5',shade:'#344c89',gloss:'#e1f7ff',opacity:.25},
 rose:{light:'#ffdfed',mid:'#e7a0c3',shade:'#975375',gloss:'#fff4dc',opacity:.22},
 gold:{light:'#fff2b9',mid:'#dfbf67',shade:'#8b6b32',gloss:'#ffffff',opacity:.3},
 ice:{light:'#edffff',mid:'#9fd8db',shade:'#57858c',gloss:'#ffffff',opacity:.3},
 graphite:{light:'#b7c5c9',mid:'#697a80',shade:'#303b41',gloss:'#e1f8ff',opacity:.24}
};
let sequence=0;
export function grokBotSVG(finish='pearl',prefix){
 const name=Object.hasOwn(botFinishes,finish)?finish:'pearl';const p=botFinishes[name];
 const id=prefix||'grok-sphere-'+(++sequence);
 return `<svg class="grok-sphere grok-${name}" viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" data-finish="${name}"><defs><radialGradient id="${id}-body" cx="68%" cy="25%" r="86%"><stop offset="0" stop-color="${p.light}"/><stop offset=".42" stop-color="${p.mid}"/><stop offset="1" stop-color="${p.shade}"/></radialGradient><linearGradient id="${id}-gloss" x1=".8" y1="0" x2=".15" y2="1"><stop stop-color="${p.gloss}" stop-opacity="${p.opacity}"/><stop offset=".52" stop-color="${p.gloss}" stop-opacity="0"/><stop offset="1" stop-color="#111719" stop-opacity=".08"/></linearGradient></defs><circle cx="110" cy="110" r="100" fill="url(#${id}-body)"/><circle cx="110" cy="110" r="100" fill="url(#${id}-gloss)"/><g fill="#151b1d"><rect x="103" y="57" width="28" height="57" rx="14" transform="rotate(-32 117 85.5)"/><rect x="156" y="32" width="22" height="56" rx="11" transform="rotate(-32 167 60)"/></g></svg>`;
}
export function finishForIdentity(id=''){const choices=['violet','lime','copper','cobalt','rose','gold','ice','graphite'];let hash=0;for(const c of String(id))hash=(hash*31+c.charCodeAt(0))>>>0;return choices[hash%choices.length];}
