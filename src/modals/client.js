import { state } from '../modules/store.js'

export const newClientModal = () => `<div class="ov c"><div class="md"><h2>New client</h2><label class="fl">Name</label><input id="cn"><label class="fl">Email</label><input id="ce"><label class="fl">Phone</label><input id="cp"><label class="fl">Address</label><textarea id="ca"></textarea><div class="row b" style="margin-top:18px"><button class="btn s" onclick="state.activeModal=null;render()">Cancel</button><button class="btn" onclick="addC()">Save client</button></div></div></div>`

export function clientEditModal() {
  const clientIndex = state.ce, clientDetails = state.clientDetails[clientIndex] || {}
  return `<div class="ov c"><div class="md"><h2>Edit client</h2><label class="fl">Name</label><input id="ecn" value="${state.clientNames[clientIndex] || ''}"><label class="fl">Email</label><input id="ece" value="${clientDetails.e || ''}"><label class="fl">Phone</label><input id="ecp" value="${clientDetails.p || ''}"><label class="fl">Address</label><textarea id="eca">${clientDetails.a || ''}</textarea><div class="row b" style="margin-top:18px"><button class="btn s" onclick="state.activeModal=null;render()">Cancel</button><button class="btn" onclick="saveClientEdit()">Save changes</button></div></div></div>`
}
