export default async function handler(req, res){
  try{
    const data = await import('../public/recipes.json', { assert: { type: 'json' } });
    res.status(200).json(data.default || data);
  }catch(e){
    res.status(200).json([]);
  }
}
