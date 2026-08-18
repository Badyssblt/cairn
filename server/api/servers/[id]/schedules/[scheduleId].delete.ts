export default defineEventHandler(async (event) => {
  requireServerRow(getRouterParam(event, 'id')!)
  deleteSchedule(getRouterParam(event, 'scheduleId')!)
  return { ok: true }
})
