// Tailwind CSS v4 reference data, written by hand for The Toolbox.
// Each group is a list of "class | css" lines; <n> marks a number from the scale.
// In v4 most sizes come from one variable: --spacing: 0.25rem, so p-4 is
// padding: calc(var(--spacing) * 4) = 1rem. Colours are variables too: var(--color-red-500).

const S = n => `calc(var(--spacing) * ${n})`;

export const GROUPS = [
  ['Layout', `
block | display: block;
inline-block | display: inline-block;
inline | display: inline;
flex | display: flex;
inline-flex | display: inline-flex;
grid | display: grid;
inline-grid | display: inline-grid;
contents | display: contents;
flow-root | display: flow-root;
table | display: table;
hidden | display: none;
sr-only | position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border-width: 0;
static | position: static;
relative | position: relative;
absolute | position: absolute;
fixed | position: fixed;
sticky | position: sticky;
inset-<n> | inset: ${S('<n>')};
inset-x-<n> | inset-inline: ${S('<n>')};
inset-y-<n> | inset-block: ${S('<n>')};
top-<n> | top: ${S('<n>')};
right-<n> | right: ${S('<n>')};
bottom-<n> | bottom: ${S('<n>')};
left-<n> | left: ${S('<n>')};
start-<n> | inset-inline-start: ${S('<n>')};
end-<n> | inset-inline-end: ${S('<n>')};
inset-full | inset: 100%;
-top-<n> | top: calc(var(--spacing) * -<n>);
z-<n> | z-index: <n>;
z-auto | z-index: auto;
overflow-auto | overflow: auto;
overflow-hidden | overflow: hidden;
overflow-clip | overflow: clip;
overflow-visible | overflow: visible;
overflow-scroll | overflow: scroll;
overflow-x-auto | overflow-x: auto;
overflow-y-auto | overflow-y: auto;
overscroll-contain | overscroll-behavior: contain;
box-border | box-sizing: border-box;
box-content | box-sizing: content-box;
float-left | float: left;
float-right | float: right;
float-none | float: none;
clear-both | clear: both;
isolate | isolation: isolate;
visible | visibility: visible;
invisible | visibility: hidden;
collapse | visibility: collapse;
object-cover | object-fit: cover;
object-contain | object-fit: contain;
object-fill | object-fit: fill;
object-center | object-position: center;
aspect-square | aspect-ratio: 1 / 1;
aspect-video | aspect-ratio: var(--aspect-video); /* 16 / 9 */
aspect-auto | aspect-ratio: auto;
aspect-<a>/<b> | aspect-ratio: <a> / <b>;
columns-<n> | columns: <n>;
container | width: 100%; /* plus max-width: <breakpoint> at each breakpoint */
@container | container-type: inline-size;`],
  ['Flex & grid', `
flex-row | flex-direction: row;
flex-row-reverse | flex-direction: row-reverse;
flex-col | flex-direction: column;
flex-col-reverse | flex-direction: column-reverse;
flex-wrap | flex-wrap: wrap;
flex-nowrap | flex-wrap: nowrap;
flex-wrap-reverse | flex-wrap: wrap-reverse;
flex-1 | flex: 1;
flex-auto | flex: auto; /* 1 1 auto */
flex-initial | flex: 0 auto; /* 0 1 auto */
flex-none | flex: none;
grow | flex-grow: 1;
grow-0 | flex-grow: 0;
shrink | flex-shrink: 1;
shrink-0 | flex-shrink: 0;
basis-<n> | flex-basis: ${S('<n>')};
basis-1/2 | flex-basis: calc(1/2 * 100%);
basis-full | flex-basis: 100%;
basis-auto | flex-basis: auto;
order-<n> | order: <n>;
order-first | order: calc(-infinity);
order-last | order: calc(infinity);
grid-cols-<n> | grid-template-columns: repeat(<n>, minmax(0, 1fr));
grid-cols-none | grid-template-columns: none;
grid-cols-subgrid | grid-template-columns: subgrid;
grid-cols-[<value>] | grid-template-columns: <value>; /* e.g. grid-cols-[200px_1fr] */
col-span-<n> | grid-column: span <n> / span <n>;
col-span-full | grid-column: 1 / -1;
col-start-<n> | grid-column-start: <n>;
col-end-<n> | grid-column-end: <n>;
grid-rows-<n> | grid-template-rows: repeat(<n>, minmax(0, 1fr));
row-span-<n> | grid-row: span <n> / span <n>;
row-start-<n> | grid-row-start: <n>;
grid-flow-row | grid-auto-flow: row;
grid-flow-col | grid-auto-flow: column;
grid-flow-dense | grid-auto-flow: dense;
auto-cols-fr | grid-auto-columns: minmax(0, 1fr);
auto-rows-min | grid-auto-rows: min-content;
gap-<n> | gap: ${S('<n>')};
gap-x-<n> | column-gap: ${S('<n>')};
gap-y-<n> | row-gap: ${S('<n>')};
justify-start | justify-content: flex-start;
justify-end | justify-content: flex-end;
justify-center | justify-content: center;
justify-between | justify-content: space-between;
justify-around | justify-content: space-around;
justify-evenly | justify-content: space-evenly;
justify-stretch | justify-content: stretch;
justify-items-center | justify-items: center;
justify-self-end | justify-self: end;
items-start | align-items: flex-start;
items-end | align-items: flex-end;
items-center | align-items: center;
items-baseline | align-items: baseline;
items-stretch | align-items: stretch;
content-center | align-content: center;
content-between | align-content: space-between;
self-auto | align-self: auto;
self-start | align-self: flex-start;
self-center | align-self: center;
self-end | align-self: flex-end;
self-stretch | align-self: stretch;
place-content-center | place-content: center;
place-items-center | place-items: center;
place-self-center | place-self: center;`],
  ['Spacing', `
p-<n> | padding: ${S('<n>')};
px-<n> | padding-inline: ${S('<n>')};
py-<n> | padding-block: ${S('<n>')};
pt-<n> | padding-top: ${S('<n>')};
pr-<n> | padding-right: ${S('<n>')};
pb-<n> | padding-bottom: ${S('<n>')};
pl-<n> | padding-left: ${S('<n>')};
ps-<n> | padding-inline-start: ${S('<n>')};
pe-<n> | padding-inline-end: ${S('<n>')};
p-px | padding: 1px;
m-<n> | margin: ${S('<n>')};
mx-<n> | margin-inline: ${S('<n>')};
my-<n> | margin-block: ${S('<n>')};
mt-<n> | margin-top: ${S('<n>')};
mr-<n> | margin-right: ${S('<n>')};
mb-<n> | margin-bottom: ${S('<n>')};
ml-<n> | margin-left: ${S('<n>')};
ms-<n> | margin-inline-start: ${S('<n>')};
me-<n> | margin-inline-end: ${S('<n>')};
-m-<n> | margin: calc(var(--spacing) * -<n>);
m-auto | margin: auto;
mx-auto | margin-inline: auto;
space-x-<n> | & > :not(:last-child) { margin-inline-end: ${S('<n>')}; } /* simplified: v4 also handles space-x-reverse */
space-y-<n> | & > :not(:last-child) { margin-block-end: ${S('<n>')}; } /* simplified */`],
  ['Sizing', `
w-<n> | width: ${S('<n>')};
w-1/2 | width: calc(1/2 * 100%); /* any fraction: w-2/3, w-3/4 … */
w-full | width: 100%;
w-screen | width: 100vw;
w-dvw | width: 100dvw;
w-auto | width: auto;
w-px | width: 1px;
w-min | width: min-content;
w-max | width: max-content;
w-fit | width: fit-content;
w-3xs | width: var(--container-3xs); /* 16rem */
w-xs | width: var(--container-xs); /* 20rem */
w-sm | width: var(--container-sm); /* 24rem */
w-md | width: var(--container-md); /* 28rem */
w-lg | width: var(--container-lg); /* 32rem */
w-xl | width: var(--container-xl); /* 36rem */
w-2xl | width: var(--container-2xl); /* 42rem */
w-3xl | width: var(--container-3xl); /* 48rem */
w-4xl | width: var(--container-4xl); /* 56rem */
w-5xl | width: var(--container-5xl); /* 64rem */
w-6xl | width: var(--container-6xl); /* 72rem */
w-7xl | width: var(--container-7xl); /* 80rem */
size-<n> | width: ${S('<n>')}; height: ${S('<n>')};
size-full | width: 100%; height: 100%;
h-<n> | height: ${S('<n>')};
h-full | height: 100%;
h-screen | height: 100vh;
h-dvh | height: 100dvh;
h-svh | height: 100svh;
min-w-<n> | min-width: ${S('<n>')};
min-w-0 | min-width: calc(var(--spacing) * 0);
max-w-<n> | max-width: ${S('<n>')};
max-w-md | max-width: var(--container-md); /* 28rem */
max-w-prose | max-width: 65ch;
max-w-full | max-width: 100%;
max-w-none | max-width: none;
max-w-screen-lg | max-width: var(--breakpoint-lg); /* 64rem */
min-h-<n> | min-height: ${S('<n>')};
min-h-screen | min-height: 100vh;
min-h-dvh | min-height: 100dvh;
max-h-<n> | max-height: ${S('<n>')};
max-h-screen | max-height: 100vh;`],
  ['Typography', `
text-xs | font-size: var(--text-xs); /* 0.75rem */ line-height: var(--text-xs--line-height); /* calc(1 / 0.75) */
text-sm | font-size: var(--text-sm); /* 0.875rem */ line-height: var(--text-sm--line-height); /* calc(1.25 / 0.875) */
text-base | font-size: var(--text-base); /* 1rem */ line-height: var(--text-base--line-height); /* calc(1.5 / 1) */
text-lg | font-size: var(--text-lg); /* 1.125rem */ line-height: var(--text-lg--line-height); /* calc(1.75 / 1.125) */
text-xl | font-size: var(--text-xl); /* 1.25rem */ line-height: var(--text-xl--line-height); /* calc(1.75 / 1.25) */
text-2xl | font-size: var(--text-2xl); /* 1.5rem */ line-height: var(--text-2xl--line-height); /* calc(2 / 1.5) */
text-3xl | font-size: var(--text-3xl); /* 1.875rem */ line-height: var(--text-3xl--line-height); /* calc(2.25 / 1.875) */
text-4xl | font-size: var(--text-4xl); /* 2.25rem */ line-height: var(--text-4xl--line-height); /* calc(2.5 / 2.25) */
text-5xl | font-size: var(--text-5xl); /* 3rem */ line-height: var(--text-5xl--line-height); /* 1 */
text-6xl | font-size: var(--text-6xl); /* 3.75rem */ line-height: 1;
text-7xl | font-size: var(--text-7xl); /* 4.5rem */ line-height: 1;
text-8xl | font-size: var(--text-8xl); /* 6rem */ line-height: 1;
text-9xl | font-size: var(--text-9xl); /* 8rem */ line-height: 1;
text-sm/6 | font-size: var(--text-sm); line-height: calc(var(--spacing) * 6); /* size + line height in one */
font-sans | font-family: var(--font-sans);
font-serif | font-family: var(--font-serif);
font-mono | font-family: var(--font-mono);
font-thin | font-weight: var(--font-weight-thin); /* 100 */
font-extralight | font-weight: var(--font-weight-extralight); /* 200 */
font-light | font-weight: var(--font-weight-light); /* 300 */
font-normal | font-weight: var(--font-weight-normal); /* 400 */
font-medium | font-weight: var(--font-weight-medium); /* 500 */
font-semibold | font-weight: var(--font-weight-semibold); /* 600 */
font-bold | font-weight: var(--font-weight-bold); /* 700 */
font-extrabold | font-weight: var(--font-weight-extrabold); /* 800 */
font-black | font-weight: var(--font-weight-black); /* 900 */
italic | font-style: italic;
not-italic | font-style: normal;
tracking-tighter | letter-spacing: var(--tracking-tighter); /* -0.05em */
tracking-tight | letter-spacing: var(--tracking-tight); /* -0.025em */
tracking-normal | letter-spacing: var(--tracking-normal); /* 0em */
tracking-wide | letter-spacing: var(--tracking-wide); /* 0.025em */
tracking-wider | letter-spacing: var(--tracking-wider); /* 0.05em */
tracking-widest | letter-spacing: var(--tracking-widest); /* 0.1em */
leading-<n> | line-height: ${S('<n>')};
leading-none | line-height: 1;
leading-tight | line-height: var(--leading-tight); /* 1.25 */
leading-snug | line-height: var(--leading-snug); /* 1.375 */
leading-normal | line-height: var(--leading-normal); /* 1.5 */
leading-relaxed | line-height: var(--leading-relaxed); /* 1.625 */
leading-loose | line-height: var(--leading-loose); /* 2 */
text-left | text-align: left;
text-center | text-align: center;
text-right | text-align: right;
text-justify | text-align: justify;
text-start | text-align: start;
underline | text-decoration-line: underline;
line-through | text-decoration-line: line-through;
no-underline | text-decoration-line: none;
underline-offset-<n> | text-underline-offset: <n>px;
decoration-<n> | text-decoration-thickness: <n>px;
uppercase | text-transform: uppercase;
lowercase | text-transform: lowercase;
capitalize | text-transform: capitalize;
normal-case | text-transform: none;
truncate | overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
text-ellipsis | text-overflow: ellipsis;
line-clamp-<n> | overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: <n>;
whitespace-nowrap | white-space: nowrap;
whitespace-pre | white-space: pre;
whitespace-pre-line | white-space: pre-line;
whitespace-pre-wrap | white-space: pre-wrap;
whitespace-normal | white-space: normal;
text-wrap | text-wrap: wrap;
text-nowrap | text-wrap: nowrap;
text-balance | text-wrap: balance;
text-pretty | text-wrap: pretty;
wrap-break-word | overflow-wrap: break-word; /* v4.1; older: break-words */
wrap-anywhere | overflow-wrap: anywhere;
break-all | word-break: break-all;
break-keep | word-break: keep-all;
hyphens-auto | hyphens: auto;
indent-<n> | text-indent: ${S('<n>')};
align-middle | vertical-align: middle;
align-top | vertical-align: top;
align-baseline | vertical-align: baseline;
list-disc | list-style-type: disc;
list-decimal | list-style-type: decimal;
list-none | list-style-type: none;
list-inside | list-style-position: inside;
antialiased | -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
tabular-nums | font-variant-numeric: tabular-nums;
text-shadow-sm | text-shadow: var(--text-shadow-sm); /* v4.1 */`],
  ['Colours', `
text-<colour>-<shade> | color: var(--color-<colour>-<shade>);
bg-<colour>-<shade> | background-color: var(--color-<colour>-<shade>);
border-<colour>-<shade> | border-color: var(--color-<colour>-<shade>);
bg-<colour>-<shade>/<n> | background-color: color-mix(in oklab, var(--color-<colour>-<shade>) <n>%, transparent);
text-black | color: var(--color-black); /* #000 */
text-white | color: var(--color-white); /* #fff */
bg-transparent | background-color: transparent;
bg-current | background-color: currentColor;
text-inherit | color: inherit;
fill-current | fill: currentColor;
stroke-current | stroke: currentColor;
fill-<colour>-<shade> | fill: var(--color-<colour>-<shade>);
stroke-<colour>-<shade> | stroke: var(--color-<colour>-<shade>);
accent-<colour>-<shade> | accent-color: var(--color-<colour>-<shade>);
caret-<colour>-<shade> | caret-color: var(--color-<colour>-<shade>);
decoration-<colour>-<shade> | text-decoration-color: var(--color-<colour>-<shade>);
outline-<colour>-<shade> | outline-color: var(--color-<colour>-<shade>);
ring-<colour>-<shade> | --tw-ring-color: var(--color-<colour>-<shade>);
placeholder:text-<colour>-<shade> | &::placeholder { color: var(--color-<colour>-<shade>); }
bg-[#hex] | background-color: #hex; /* any arbitrary value in [ ] */
bg-linear-to-r | background-image: linear-gradient(to right in oklab, var(--tw-gradient-stops)); /* simplified; was bg-gradient-to-r in v3 */
bg-linear-<angle> | background-image: linear-gradient(<angle>deg in oklab, var(--tw-gradient-stops)); /* simplified */
bg-radial | background-image: radial-gradient(in oklab, var(--tw-gradient-stops)); /* simplified */
from-<colour>-<shade> | --tw-gradient-from: var(--color-<colour>-<shade>); /* gradient start */
via-<colour>-<shade> | --tw-gradient-via: var(--color-<colour>-<shade>); /* gradient middle */
to-<colour>-<shade> | --tw-gradient-to: var(--color-<colour>-<shade>); /* gradient end */
bg-cover | background-size: cover;
bg-contain | background-size: contain;
bg-center | background-position: center;
bg-no-repeat | background-repeat: no-repeat;
bg-fixed | background-attachment: fixed;
bg-clip-text | background-clip: text;`],
  ['Borders', `
border | border-style: var(--tw-border-style); border-width: 1px;
border-<n> | border-style: var(--tw-border-style); border-width: <n>px;
border-x | border-inline-style: var(--tw-border-style); border-inline-width: 1px;
border-y | border-block-style: var(--tw-border-style); border-block-width: 1px;
border-t | border-top-style: var(--tw-border-style); border-top-width: 1px;
border-b | border-bottom-style: var(--tw-border-style); border-bottom-width: 1px;
border-0 | border-style: var(--tw-border-style); border-width: 0px;
border-solid | --tw-border-style: solid; border-style: solid;
border-dashed | --tw-border-style: dashed; border-style: dashed;
border-dotted | --tw-border-style: dotted; border-style: dotted;
border-none | --tw-border-style: none; border-style: none;
rounded-none | border-radius: 0;
rounded-xs | border-radius: var(--radius-xs); /* 0.125rem */
rounded | border-radius: 0.25rem;
rounded-sm | border-radius: var(--radius-sm); /* 0.25rem */
rounded-md | border-radius: var(--radius-md); /* 0.375rem */
rounded-lg | border-radius: var(--radius-lg); /* 0.5rem */
rounded-xl | border-radius: var(--radius-xl); /* 0.75rem */
rounded-2xl | border-radius: var(--radius-2xl); /* 1rem */
rounded-3xl | border-radius: var(--radius-3xl); /* 1.5rem */
rounded-4xl | border-radius: var(--radius-4xl); /* 2rem */
rounded-full | border-radius: calc(infinity * 1px);
rounded-t-lg | border-top-left-radius: var(--radius-lg); border-top-right-radius: var(--radius-lg);
rounded-s-lg | border-start-start-radius: var(--radius-lg); border-end-start-radius: var(--radius-lg);
divide-x | & > :not(:last-child) { border-inline-end-width: 1px; } /* simplified */
divide-y | & > :not(:last-child) { border-bottom-width: 1px; } /* simplified */
outline | outline-style: var(--tw-outline-style); outline-width: 1px;
outline-<n> | outline-style: var(--tw-outline-style); outline-width: <n>px;
outline-hidden | outline: 2px solid transparent; outline-offset: 2px; /* v4; v3 called this outline-none */
outline-none | --tw-outline-style: none; outline-style: none;
outline-offset-<n> | outline-offset: <n>px;
ring | box-shadow: 0 0 0 1px var(--tw-ring-color, currentcolor); /* simplified; v4 ring is 1px (v3 was 3px) */
ring-<n> | box-shadow: 0 0 0 <n>px var(--tw-ring-color, currentcolor); /* simplified */
ring-inset | --tw-ring-inset: inset;
ring-offset-<n> | --tw-ring-offset-width: <n>px;`],
  ['Effects', `
shadow-2xs | box-shadow: 0 1px rgb(0 0 0 / 0.05);
shadow-xs | box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
shadow-sm | box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
shadow-md | box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
shadow-lg | box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
shadow-xl | box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
shadow-2xl | box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25);
shadow-none | box-shadow: 0 0 #0000;
inset-shadow-sm | box-shadow: inset 0 2px 4px rgb(0 0 0 / 0.05); /* simplified */
opacity-<n> | opacity: <n>%;
mix-blend-multiply | mix-blend-mode: multiply;
mix-blend-screen | mix-blend-mode: screen;
blur-xs | filter: blur(var(--blur-xs)); /* 4px */
blur-sm | filter: blur(var(--blur-sm)); /* 8px */
blur-md | filter: blur(var(--blur-md)); /* 12px */
blur-lg | filter: blur(var(--blur-lg)); /* 16px */
blur-xl | filter: blur(var(--blur-xl)); /* 24px */
blur-2xl | filter: blur(var(--blur-2xl)); /* 40px */
blur-3xl | filter: blur(var(--blur-3xl)); /* 64px */
backdrop-blur-md | backdrop-filter: blur(var(--blur-md)); /* 12px */
grayscale | filter: grayscale(100%);
invert | filter: invert(100%);
sepia | filter: sepia(100%);
brightness-<n> | filter: brightness(<n>%);
contrast-<n> | filter: contrast(<n>%);
saturate-<n> | filter: saturate(<n>%);
drop-shadow-md | filter: drop-shadow(var(--drop-shadow-md)); /* 0 3px 3px rgb(0 0 0 / 0.12) */
cursor-pointer | cursor: pointer;
cursor-not-allowed | cursor: not-allowed;
cursor-wait | cursor: wait;
pointer-events-none | pointer-events: none;
pointer-events-auto | pointer-events: auto;
select-none | user-select: none;
select-all | user-select: all;
resize | resize: both;
resize-y | resize: vertical;
appearance-none | appearance: none;
scroll-smooth | scroll-behavior: smooth;
snap-x | scroll-snap-type: x var(--tw-scroll-snap-strictness);
snap-mandatory | --tw-scroll-snap-strictness: mandatory;
snap-center | scroll-snap-align: center;
touch-none | touch-action: none;
touch-manipulation | touch-action: manipulation;
will-change-transform | will-change: transform;`],
  ['Transforms', `
scale-<n> | --tw-scale-x: <n>%; --tw-scale-y: <n>%; --tw-scale-z: <n>%; scale: var(--tw-scale-x) var(--tw-scale-y);
scale-x-<n> | --tw-scale-x: <n>%; scale: var(--tw-scale-x) var(--tw-scale-y);
rotate-<n> | rotate: <n>deg;
-rotate-<n> | rotate: calc(<n>deg * -1);
translate-x-<n> | --tw-translate-x: ${S('<n>')}; translate: var(--tw-translate-x) var(--tw-translate-y);
translate-y-<n> | --tw-translate-y: ${S('<n>')}; translate: var(--tw-translate-x) var(--tw-translate-y);
-translate-x-1/2 | --tw-translate-x: calc(calc(1/2 * 100%) * -1); translate: var(--tw-translate-x) var(--tw-translate-y);
translate-x-full | --tw-translate-x: 100%; translate: var(--tw-translate-x) var(--tw-translate-y);
skew-x-<n> | --tw-skew-x: skewX(<n>deg); transform: var(--tw-rotate-x) var(--tw-rotate-y) var(--tw-rotate-z) var(--tw-skew-x) var(--tw-skew-y);
origin-center | transform-origin: center;
origin-top-left | transform-origin: top left;
origin-bottom | transform-origin: bottom;
transform-gpu | transform: translateZ(0) var(--tw-rotate-x) var(--tw-rotate-y) var(--tw-rotate-z) var(--tw-skew-x) var(--tw-skew-y);
transform-none | transform: none;
rotate-x-<n> | --tw-rotate-x: rotateX(<n>deg); transform: var(--tw-rotate-x) var(--tw-rotate-y) var(--tw-rotate-z) var(--tw-skew-x) var(--tw-skew-y); /* 3D, new in v4 */
perspective-normal | perspective: var(--perspective-normal); /* 500px */
backface-hidden | backface-visibility: hidden;`],
  ['Transitions', `
transition | transition-property: color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to, opacity, box-shadow, transform, translate, scale, rotate, filter, backdrop-filter; transition-timing-function: var(--default-transition-timing-function); /* cubic-bezier(0.4, 0, 0.2, 1) */ transition-duration: var(--default-transition-duration); /* 150ms */
transition-all | transition-property: all; transition-timing-function: var(--default-transition-timing-function); transition-duration: var(--default-transition-duration);
transition-colors | transition-property: color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to; transition-timing-function: var(--default-transition-timing-function); transition-duration: var(--default-transition-duration);
transition-opacity | transition-property: opacity; transition-timing-function: var(--default-transition-timing-function); transition-duration: var(--default-transition-duration);
transition-shadow | transition-property: box-shadow; transition-timing-function: var(--default-transition-timing-function); transition-duration: var(--default-transition-duration);
transition-transform | transition-property: transform, translate, scale, rotate; transition-timing-function: var(--default-transition-timing-function); transition-duration: var(--default-transition-duration);
transition-none | transition-property: none;
duration-<n> | --tw-duration: <n>ms; transition-duration: <n>ms;
delay-<n> | transition-delay: <n>ms;
ease-linear | --tw-ease: linear; transition-timing-function: linear;
ease-in | --tw-ease: var(--ease-in); transition-timing-function: var(--ease-in); /* cubic-bezier(0.4, 0, 1, 1) */
ease-out | --tw-ease: var(--ease-out); transition-timing-function: var(--ease-out); /* cubic-bezier(0, 0, 0.2, 1) */
ease-in-out | --tw-ease: var(--ease-in-out); transition-timing-function: var(--ease-in-out); /* cubic-bezier(0.4, 0, 0.2, 1) */
animate-spin | animation: var(--animate-spin); /* spin 1s linear infinite */
animate-ping | animation: var(--animate-ping); /* ping 1s cubic-bezier(0, 0, 0.2, 1) infinite */
animate-pulse | animation: var(--animate-pulse); /* pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite */
animate-bounce | animation: var(--animate-bounce); /* bounce 1s infinite */
animate-none | animation: none;
motion-reduce:transition-none | @media (prefers-reduced-motion: reduce) { transition-property: none; }`],
  ['Variants', `
sm:… | @media (width >= 40rem) { … } /* 640px */
md:… | @media (width >= 48rem) { … } /* 768px */
lg:… | @media (width >= 64rem) { … } /* 1024px */
xl:… | @media (width >= 80rem) { … } /* 1280px */
2xl:… | @media (width >= 96rem) { … } /* 1536px */
max-md:… | @media (width < 48rem) { … }
@md:… | @container (width >= 28rem) { … } /* needs @container on a parent */
hover:… | &:hover { @media (hover: hover) { … } } /* v4 only applies hover on devices that can hover */
focus:… | &:focus { … }
focus-visible:… | &:focus-visible { … }
active:… | &:active { … }
disabled:… | &:disabled { … }
first:… | &:first-child { … }
last:… | &:last-child { … }
odd:… | &:nth-child(odd) { … }
group-hover:… | &:is(:where(.group):hover *) { … } /* put "group" on the parent */
peer-checked:… | &:is(:where(.peer):checked ~ *) { … } /* put "peer" on an earlier sibling */
dark:… | @media (prefers-color-scheme: dark) { … }
not-…:… | &:not(…) { … } /* e.g. not-first:mt-2 */
starting:… | @starting-style { … } /* enter transitions */
*:… | :is(& > *) { … } /* style direct children */
print:… | @media print { … }
motion-safe:… | @media (prefers-reduced-motion: no-preference) { … }`],
].map(([name, text]) => [name, text.trim().split('\n').map(l => {
  const i = l.indexOf(' | ');
  return { c: l.slice(0, i), css: l.slice(i + 3) };
})]);

export const COLOURS = 'slate gray zinc neutral stone red orange amber yellow lime green emerald teal cyan sky blue indigo violet purple fuchsia pink rose'.split(' ');
export const SHADES = '50 100 200 300 400 500 600 700 800 900 950'.split(' ');

// rem value of a spacing multiple, for the little "= 1rem" hint.
export const remOf = n => {
  const v = Number(n) * 0.25;
  return Number.isFinite(v) ? `${+v.toFixed(4)}rem` : '';
};

// Turns a concrete class ("p-4", "-mt-2.5", "bg-sky-500/50", "grid-cols-3") into its
// pattern entry with the numbers filled in. Returns { c, css, hint } or null.
export function resolve(cls) {
  const q = cls.trim();
  if (!q) return null;
  const all = GROUPS.flatMap(([g, list]) => list.map(e => ({ ...e, g })));
  const exact = all.find(e => e.c === q);
  if (exact) return exact;
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const e of all) {
    if (!/<[a-z]+>/.test(e.c)) continue;
    const names = [];
    const re = new RegExp('^' + esc(e.c).replace(/<([a-z]+)>/g, (_, n) => {
      names.push(n);
      return n === 'colour' ? `(${COLOURS.join('|')})` : n === 'shade' ? `(${SHADES.join('|')})` : '(\\d+(?:\\.\\d+)?)';
    }) + '$');
    const m = q.match(re);
    if (!m) continue;
    let css = e.css;
    names.forEach((n, i) => { css = css.split(`<${n}>`).join(m[i + 1]); });
    const n = names.indexOf('n');
    const hint = n >= 0 && e.css.includes('--spacing') ? `${m[n + 1]} × 0.25rem = ${remOf(m[n + 1])}` : '';
    return { c: q, css, hint, g: e.g };
  }
  // Fractions: w-2/3, basis-1/4, translate-x-1/3
  const f = q.match(/^(-?)(w|h|basis|inset|top|left|right|bottom|translate-x|translate-y|max-w)-(\d+)\/(\d+)$/);
  if (f) {
    const prop = { w: 'width', h: 'height', basis: 'flex-basis', inset: 'inset', top: 'top', left: 'left', right: 'right', bottom: 'bottom', 'max-w': 'max-width' }[f[2]];
    const v = `calc(${f[3]}/${f[4]} * 100%)`;
    if (!prop) return { c: q, css: `--tw-${f[2]}: ${f[1] ? `calc(${v} * -1)` : v}; translate: var(--tw-translate-x) var(--tw-translate-y);`, g: 'Transforms' };
    return { c: q, css: `${prop}: ${f[1] ? `calc(${v} * -1)` : v};`, g: 'Sizing' };
  }
  return null;
}
