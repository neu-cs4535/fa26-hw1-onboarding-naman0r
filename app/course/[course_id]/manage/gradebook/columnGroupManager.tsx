"use client";

import { useGradebookColumnGroups, useGradebookColumns, useGradebookController } from "@/hooks/useGradebook";
import { createClient } from "@/utils/supabase/client";
import { toaster } from "@/components/ui/toaster";
import { Button, Dialog, HStack, Input, NativeSelect, Portal, Text, VStack } from "@chakra-ui/react";
import { useState } from "react";

export default function ColumnGroupManager() {
  const controller = useGradebookController();
  const groups = useGradebookColumnGroups();
  const columns = useGradebookColumns();
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [busy, setBusy] = useState(false);
  const ordered = [...groups].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

  async function save(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await Promise.all([controller.gradebook_column_groups.refetchAll(), controller.gradebook_columns.refetchAll()]);
    } catch (error) {
      toaster.create({
        title: "Could not update groups",
        description:
          typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error),
        type: "error"
      });
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, direction: number) {
    const ids = ordered.map((group) => group.id);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    const { error } = await createClient().rpc("gradebook_column_groups_reorder", {
      p_gradebook_id: controller.gradebook_id,
      p_group_ids: ids
    });
    if (error) throw new Error(error.message);
  }

  return (
    <Dialog.Root size="lg" scrollBehavior="inside">
      <Dialog.Trigger asChild>
        <Button size="sm" variant="outline">
          Manage groups
        </Button>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Gradebook groups</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <VStack align="stretch" gap={4}>
                <Text fontSize="sm">
                  Groups stay together when reordered. Ungrouped columns follow groups. Deleting a group keeps its
                  columns and grades.
                </Text>
                <HStack
                  as="form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void save(async () => {
                      await controller.gradebook_column_groups.create({
                        class_id: controller.class_id,
                        gradebook_id: controller.gradebook_id,
                        name: name.trim(),
                        sort_order: (ordered.at(-1)?.sort_order ?? -1) + 1
                      });
                      setName("");
                    });
                  }}
                >
                  <Input aria-label="New group name" value={name} onChange={(event) => setName(event.target.value)} />
                  <Button type="submit" disabled={busy || !name.trim()}>
                    Create group
                  </Button>
                </HStack>
                {ordered.map((group, index) => (
                  <HStack key={group.id} flexWrap="wrap" borderBottomWidth="1px" pb={2}>
                    {editingId === group.id ? (
                      <>
                        <Input
                          flex={1}
                          aria-label="Rename group"
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                        />
                        <Button
                          size="sm"
                          disabled={busy || !editingName.trim()}
                          onClick={() =>
                            void save(async () => {
                              await controller.gradebook_column_groups.update(group.id, { name: editingName.trim() });
                              setEditingId(null);
                            })
                          }
                        >
                          Save name
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Text flex={1}>{group.name}</Text>
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={busy}
                          aria-label={`Rename ${group.name}`}
                          onClick={() => {
                            setEditingId(group.id);
                            setEditingName(group.name);
                          }}
                        >
                          Rename
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={busy || index === 0}
                          aria-label={`Move ${group.name} earlier`}
                          onClick={() => void save(() => move(index, -1))}
                        >
                          Earlier
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={busy || index === ordered.length - 1}
                          aria-label={`Move ${group.name} later`}
                          onClick={() => void save(() => move(index, 1))}
                        >
                          Later
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          colorPalette="red"
                          disabled={busy}
                          aria-label={`Delete ${group.name}`}
                          onClick={() => void save(() => controller.gradebook_column_groups.hardDelete(group.id))}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </HStack>
                ))}
                <Text fontWeight="semibold">Column membership</Text>
                {[...columns]
                  .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id)
                  .map((column) => (
                    <HStack key={column.id}>
                      <Text flex={1} fontSize="sm">
                        {column.name}
                      </Text>
                      <NativeSelect.Root width="50%" disabled={busy}>
                        <NativeSelect.Field
                          aria-label={`Group for ${column.name}`}
                          value={column.group_id ?? ""}
                          onChange={(event) => {
                            const group_id = event.target.value ? Number(event.target.value) : null;
                            void save(() => controller.gradebook_columns.update(column.id, { group_id }));
                          }}
                        >
                          <option value="">Ungrouped</option>
                          {ordered.map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.name}
                            </option>
                          ))}
                        </NativeSelect.Field>
                        <NativeSelect.Indicator />
                      </NativeSelect.Root>
                    </HStack>
                  ))}
              </VStack>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button variant="outline">Done</Button>
              </Dialog.ActionTrigger>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
