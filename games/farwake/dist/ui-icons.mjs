/** Small, local instrument symbols. Text labels remain the accessible names. */
const paths={
 Map:'M2 3l4-1 4 2 4-1v10l-4 1-4-2-4 1zM6 2v10M10 4v10',
 Log:'M3 2h10v12H3zM6 5h4M6 8h4M6 11h2',
 Ship:'M8 2l5 11-5-3-5 3zM8 6v4',
 Captain:'M6 2h4v4H6zM3 14v-3l3-2h4l3 2v3',
 'Port services':'M2 5h12v8H2zM5 5V2h6v3M5 9h6M8 6v6',
 Crew:'M6 2h4v4H6zM5 13v-3h6v3M1 4h2v3H1M13 4h2v3h-2M1 10v3h2M13 13h2v-3',
 'Action help':'M6 5V3h5v4L8 9v2M8 13v1',
 Settings:'M2 4h12M2 8h12M2 12h12M5 2v4M11 6v4M6 10v4',
 View:'M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4M6 8h4M8 6v4',
 'Damage control':'M8 2l6 12H2zM8 6v4M8 12v1',
 Contacts:'M3 4a6 6 0 0 1 10 0M5 6a4 4 0 0 1 6 0M8 8v6M5 14h6',
 default:'M3 8h10M9 4l4 4-4 4'
};
export function navIcon(name){return `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="${paths[name]||paths.default}"/></svg>`;}
