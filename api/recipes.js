
const fs = require('fs').promises;
const path = require('path');
module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.setHeader('Allow', ['GET']); return res.status(405).json({ error: 'Método no permitido' }); }
  try {
    const filePath = path.join(process.cwd(), 'public', 'recipes.json');
    const data = await fs.readFile(filePath, 'utf-8');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).send(data);
  } catch (err) { return res.status(500).json({ error: 'No se pudo leer recipes.json', detail: String(err) }); }
};
