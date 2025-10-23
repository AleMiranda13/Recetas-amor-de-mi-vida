// api/recipes.js
import { promises as fs } from 'fs';
import path from 'path';

export default async function handler(req, res) {
  try {
    const file = path.join(process.cwd(), 'public', 'recipes.json');
    const buf = await fs.readFile(file, 'utf8');
    const data = JSON.parse(buf);
    res.status(200).json(Array.isArray(data) ? data : []);
  } catch (e) {
    console.error('recipes api error', e);
    res.status(200).json([]); // el front cae a ./recipes.json si recibe []
  }
}