export function resolveBulkRoomScopePolicy(input: {
  roomIds: string[];
  roomScope: string | null;
  selectedRoomId: string | null;
  applyToAllRooms: boolean;
}): { ok: true; roomIds: string[] } | { ok: false; error: string } {
  if (input.roomIds.length === 0) {
    return { ok: false, error: "Select at least one room." };
  }

  if (input.roomScope === "all") {
    if (!input.applyToAllRooms) {
      return { ok: false, error: "Confirm all-room bulk apply before updating every visible room." };
    }
    if (input.roomIds.length < 2) {
      return { ok: false, error: "All-room bulk apply needs at least two visible rooms." };
    }
    return { ok: true, roomIds: input.roomIds };
  }

  if (!input.selectedRoomId) {
    return { ok: false, error: "Select one room for the bulk calendar update." };
  }
  if (input.roomIds.length !== 1 || input.roomIds[0] !== input.selectedRoomId) {
    return { ok: false, error: "Bulk calendar update room scope did not match the selected room." };
  }
  return { ok: true, roomIds: input.roomIds };
}
