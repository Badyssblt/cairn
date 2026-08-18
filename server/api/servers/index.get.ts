export default defineEventHandler(async () => {
  const rows = listServerRows()
  const servers = await Promise.all(rows.map(toMinecraftServer))
  return { servers, host: hostCapacity() }
})
