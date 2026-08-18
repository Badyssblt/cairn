export default defineEventHandler(async (event) => {
  const row = requireServerRow(getRouterParam(event, 'id')!)
  if (row.game !== 'minecraft') {
    throw createError({ statusCode: 400, statusMessage: 'Les datapacks sont propres à Minecraft.' })
  }

  const props = await readProperties(row.data_dir)
  const value = (key: string) => props.find((p) => p.key === key)?.value.trim() ?? ''

  return {
    levelName: await levelName(row),
    datapacks: await listDatapacks(row),
    resourcePack: {
      url: value('resource-pack'),
      sha1: value('resource-pack-sha1'),
      required: value('require-resource-pack') === 'true',
    },
  }
})
