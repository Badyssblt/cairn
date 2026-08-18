export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)
  const addr = await publicAddress()

  return {
    host: addr.host,
    source: addr.source,
    port: row.host_port,
    address: `${addr.host}:${row.host_port}`,
    // Le port écoute-t-il sur la machine ? Voir publicAddress.ts sur ce que
    // cette réponse prouve — et surtout ce qu'elle ne prouve pas.
    listening: await portResponds(row.host_port),
  }
})
