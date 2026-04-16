import { render } from 'preact';
import { App } from './App';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('UI mount point #root missing');
render(<App />, root);
