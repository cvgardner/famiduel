import './style.css';
import { App } from './app/app';
import { smallText } from './engine/draw';

const app = new App(document.getElementById('app')!);
// Test and debug hook.
(window as unknown as { __famiduel: App }).__famiduel = app;
(window as unknown as { __smallText: Map<string, number> }).__smallText = smallText;
