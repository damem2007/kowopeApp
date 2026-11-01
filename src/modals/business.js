import { state } from '../modules/store.js'

export const businessModal = () => {
  const businessProfile = state.be >= 0 ? state.businessProfiles[state.be] : { n: "", a: "", e: "", p: "" }
  return `<div class="ov c"><div class="md"><h2>${state.be >= 0 ? "Edit business" : "New business"}</h2><label class="fl">Business name</label><input id="bn" value="${businessProfile.n}"><label class="fl">Address</label><textarea id="ba">${businessProfile.a}</textarea><label class="fl">Email</label><input id="be" value="${businessProfile.e}"><label class="fl">Phone</label><input id="bp" value="${businessProfile.p}"><div class="row b" style="margin-top:18px"><button class="btn s" onclick="state.activeModal=null;render()">Cancel</button><button class="btn" onclick="saveBiz()">Save business</button></div></div></div>`
}
