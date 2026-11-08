import './style.css';
import { App } from './app/app';
import { contrastProbe, edgeProbe, readerProbe, smallText } from './engine/draw';
import { keepPortrait } from './engine/portrait';
import { popProbe } from './engine/fx';

const root = document.getElementById('app')!;
const app = new App(root);
keepPortrait(root, () => app.stage.resize());
// Test and debug hooks.
(window as unknown as { __famiduel: App }).__famiduel = app;
(window as unknown as { __smallText: Map<string, number> }).__smallText = smallText;
(window as unknown as { __contrast: typeof contrastProbe }).__contrast = contrastProbe;
(window as unknown as { __edges: typeof edgeProbe }).__edges = edgeProbe;
(window as unknown as { __reader: typeof readerProbe }).__reader = readerProbe;
(window as unknown as { __pops: typeof popProbe }).__pops = popProbe;
