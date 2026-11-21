// Spec rows per slice, from the plan's §5 S1 task table (S1.1–S1.8).
export const slices={
 S1:['F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12','F13','F14','F15','F16','F18','F19','F20','F23','F32','F35','F37','F44','F47','N4','N5','N6','N8','N19','N21','N22'],
};
export const inSlice=(scenario,slice)=>scenario.featureRows.some(r=>slices[slice].includes(r));
