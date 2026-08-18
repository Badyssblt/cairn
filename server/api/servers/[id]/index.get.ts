export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)
  return { server: await toMinecraftServer(row) }
})
