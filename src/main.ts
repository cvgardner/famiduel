import './style.css';
import { App } from './app/app';

const app = new App(document.getElementById('app')!);
// Test and debug hook.
(window as unknown as { __famiduel: App }).__famiduel = app;
