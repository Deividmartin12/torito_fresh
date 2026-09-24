/**
 * Clases Tailwind compartidas por los formularios dentro de modales: la grilla del
 * formulario, el input/select/textarea "pill", las etiquetas y las notas de error o ayuda.
 * Se exponen como strings (no como componentes) porque cada campo ya es un `<label>` con su
 * propio `<input>`/`<select>`/`<textarea>` nativo, con props y validaciones distintas.
 */
export const modalFormClass = 'grid grid-cols-1 gap-[13px] p-[17px_18px] tablet:grid-cols-2';

export const fieldWideClass = 'col-span-full';

export const fieldLabelClass =
  'mb-[5px] ml-[3px] block text-[10px] font-medium uppercase text-muted';

const controlBase =
  'w-full border border-line bg-surface text-[13px] text-fg outline-0 focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)]';

export const controlClass = `${controlBase} h-10 rounded-full px-[13px]`;

export const textareaClass = `${controlBase} min-h-[78px] resize-y rounded-[14px] px-[13px] py-[9px]`;

export const fieldErrorClass = 'mt-[5px] ml-0.5 block text-xs text-[#c52e49] dark:text-[#ff9db2]';

export const fieldHintClass = 'mt-[5px] ml-0.5 block text-xs text-muted';

export const formHintClass = '-mt-1 text-xs leading-[1.45] text-muted';

export const fieldWithActionClass = 'flex gap-2';

export const checkboxFieldClass = 'flex cursor-pointer flex-row items-center gap-2.5';

export const checkboxInputClass = 'm-0 h-4 w-4 accent-accent';

export const modalActionsClass = 'col-span-full flex justify-end gap-2 pt-[3px]';

export const modalFormSectionClass =
  'col-span-full mt-[5px] flex flex-col gap-[3px] border-t border-line pt-[15px]';

export const modalFormSectionTitleClass = 'text-[13px] font-semibold text-fg';

export const modalFormSectionHintClass = 'text-xs leading-[1.45] text-muted';
