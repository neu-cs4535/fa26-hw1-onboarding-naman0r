/**
 * Grading artifact for the CS 4535 column-groups onboarding assignment.
 *
 * Twenty-four people solve the same problem independently, and the thing being compared is what
 * the gradebook's column headers end up looking like. This spec photographs that, against the
 * `cs4535` seed template, so one submission's headers can be put next to another's.
 *
 * It deliberately asserts almost nothing about *which* groups appear. Reproducing today's
 * grouping exactly is correct at Pass, and correcting it is the whole point of Credit, so a spec
 * that pinned the group names would fail precisely the submissions that did the most work. What
 * it does assert is that the gradebook still renders and still groups something — the floor every
 * band shares — and then captures the evidence for a human to read.
 *
 * Three artifacts per run:
 *   - `column-groups-expanded`    every group open: which column sits under which header
 *   - `column-groups-collapsed`   every group collapsed: the header row, which is the comparison
 *   - `column-group-headers.json` the same header text as text, so 24 submissions can be diffed
 *                                 rather than eyeballed
 *
 * Requires the seeded class: `npm run seed -- --template cs4535`. It reads that class rather than
 * building its own fixture, because the planted cases the assignment is about (the hole in
 * sort_order where quiz-3 was, `assignment-final`'s two slug parts) live in the template, not in
 * the generic test helpers.
 */
import { test, expect } from "../global-setup";
import { supabase, loginAsUser, type TestingUser } from "./TestingUtils";
import { visualScreenshot } from "./VisualTestUtils";
import type { Course } from "@/utils/supabase/DatabaseTypes";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

const SEEDED_CLASS_NAME = process.env.COLUMN_GROUPS_CLASS_NAME ?? "CS 4535: Software Design & Delivery";

/** Resolve the seeded class, with an error that names the fix rather than a null dereference. */
async function findSeededClass(): Promise<Course> {
  const { data, error } = await supabase
    .from("classes")
    .select("*")
    .eq("name", SEEDED_CLASS_NAME)
    .order("id", { ascending: false })
    .limit(1);
  if (error) {
    throw new Error(`Could not query classes: ${error.message}`);
  }
  if (!data?.length) {
    throw new Error(
      `No class named "${SEEDED_CLASS_NAME}". Run \`npm run seed -- --template cs4535\` first, ` +
        `or set COLUMN_GROUPS_CLASS_NAME to the class you want photographed.`
    );
  }
  return data[0] as Course;
}

/**
 * An instructor in that class to log in as. The seeder pins the first instructor to
 * FIXED_INSTRUCTOR_EMAIL when it is set, which is how CI gets a predictable account; without it,
 * fall back to whichever instructor the run happened to generate.
 */
async function findInstructor(class_id: number): Promise<TestingUser> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("user_id, private_profile_id, public_profile_id, users(email), profiles!private_profile_id(name)")
    .eq("class_id", class_id)
    .eq("role", "instructor")
    .limit(50);
  if (error) {
    throw new Error(`Could not query instructors for class ${class_id}: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as Array<{
    user_id: string;
    private_profile_id: string;
    public_profile_id: string;
    users: { email: string | null } | null;
    profiles: { name: string | null } | null;
  }>;
  const preferred = process.env.FIXED_INSTRUCTOR_EMAIL;
  const row = (preferred && rows.find((r) => r.users?.email === preferred)) || rows.find((r) => r.users?.email);
  if (!row?.users?.email) {
    throw new Error(`Class ${class_id} has no instructor with an email address to log in as.`);
  }

  return {
    private_profile_name: row.profiles?.name ?? "Instructor",
    public_profile_name: row.profiles?.name ?? "Instructor",
    email: row.users.email,
    user_id: row.user_id,
    private_profile_id: row.private_profile_id,
    public_profile_id: row.public_profile_id,
    class_id,
    password: process.env.TEST_PASSWORD ?? "change-it"
  };
}

test.describe("gradebook column groups", () => {
  // Wider than the default 1280 on purpose. The gradebook virtualizes horizontally, so the
  // viewport decides how much of it a screenshot contains, and at 1280 the tail is cut off —
  // which is where `attendance`, the `ai-usage-log-*` pair and `assignment-final` sit, three of
  // the cases the seed plants. Fixed rather than maximised so every submission's screenshot is
  // the same size and can be flipped through side by side.
  test.use({ viewport: { width: 2560, height: 1440 } });

  // A prod build of this page is slow to warm and the table is wide; the default 60s is not enough
  // to log in, load, collapse, expand and capture twice.
  test.setTimeout(180_000);

  test("photograph the grouped gradebook for grading", async ({ page }, testInfo) => {
    const course = await findSeededClass();
    const instructor = await findInstructor(course.id);

    await loginAsUser(page, instructor, course);
    await page.goto(`/course/${course.id}/manage/gradebook`);

    // The column headers are what this spec is about, so wait for them rather than for the page
    // heading — the heading paints before the table has columns in it.
    const headers = page.getByRole("columnheader");
    await expect(headers.first()).toBeVisible({ timeout: 60_000 });
    await expect
      .poll(async () => headers.count(), { timeout: 60_000, message: "gradebook never rendered its columns" })
      .toBeGreaterThan(5);

    const collapseAll = page.getByRole("button", { name: "Collapse all groups" });
    const expandAll = page.getByRole("button", { name: "Expand all groups" });

    // Both controls are asserted rather than probed: a submission that removed them has changed
    // the deliverable, and that deserves a named failure instead of a blank screenshot.
    await expect(collapseAll).toBeVisible({ timeout: 30_000 });
    await expect(expandAll).toBeVisible();

    const headerTexts = async () => (await page.getByRole("columnheader").allInnerTexts()).map((t) => t.trim());

    await expandAll.click();
    const expandedHeaders = await headerTexts();
    await visualScreenshot(page, "column-groups-expanded");

    await collapseAll.click();
    // Collapsing hides all but one column of each group, so which columns are on screen has to
    // change. Compare the header list, not its length: the table virtualizes horizontally, so the
    // count is set by how many columns fit in the viewport and stays put either way.
    //
    // This is the floor assertion and it is deliberately behavioural. It holds whatever a
    // submission renames the groups to, or however it rewrites the header markup, and it fails
    // only when nothing is grouped at all. Asserting the group *names* would fail exactly the
    // submissions that did the most work, since correcting today's grouping is what Credit asks
    // for.
    await expect
      .poll(async () => JSON.stringify(await headerTexts()), {
        timeout: 30_000,
        message: "collapsing every group changed nothing on screen, so the gradebook is grouping nothing"
      })
      .not.toBe(JSON.stringify(expandedHeaders));
    const collapsedHeaders = await headerTexts();
    await visualScreenshot(page, "column-groups-collapsed");

    // The app's own one-line summary of each group ("4 Labs...", and two "2 Quizzes..." where the
    // seeded quiz family is split by the hole in sort_order). Best-effort: it is read by text
    // shape, so a submission that renders its headers differently gets an empty list here rather
    // than a failure. The screenshots remain the primary artifact.
    const groupSummaries = await page.getByText(/^\d+\s+\S+\.\.\.$/).allInnerTexts();

    const report = {
      capturedAt: new Date().toISOString(),
      className: course.name,
      classId: course.id,
      commit: process.env.GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? null,
      groupSummaries: groupSummaries.map((t) => t.trim()),
      expandedHeaderCount: expandedHeaders.length,
      collapsedHeaderCount: collapsedHeaders.length,
      expandedHeaders,
      collapsedHeaders
    };
    await testInfo.attach("column-group-headers.json", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json"
    });

    // eslint-disable-next-line no-console
    console.log(`Group headers when collapsed: ${groupSummaries.join(" | ") || "(none matched by text shape)"}`);
  });

  test("manage groups without losing membership or grades", async ({ page }) => {
    const course = await findSeededClass();
    const instructor = await findInstructor(course.id);
    const { data: columns, error } = await supabase
      .from("gradebook_columns")
      .select("id, group_id, name")
      .eq("class_id", course.id)
      .in("slug", ["quiz-1", "quiz-2"]);
    if (error) throw error;
    expect(columns).toHaveLength(2);
    const before = await supabase
      .from("gradebook_column_students")
      .select("*", { count: "exact", head: true })
      .in(
        "gradebook_column_id",
        columns!.map((column) => column.id)
      );
    const groupName = `Review group ${Date.now()}`;
    const renamed = `${groupName} renamed`;
    let groupId: number | undefined;
    try {
      await loginAsUser(page, instructor, course);
      await page.goto(`/course/${course.id}/manage/gradebook`);
      await page.getByRole("button", { name: "Manage groups", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Gradebook groups" });
      await dialog.getByLabel("New group name").fill(groupName);
      await dialog.getByRole("button", { name: "Create group", exact: true }).click();
      await expect(dialog.getByRole("button", { name: `Rename ${groupName}`, exact: true })).toBeEnabled();
      const { data: group } = await supabase
        .from("gradebook_column_groups")
        .select("id")
        .eq("class_id", course.id)
        .eq("name", groupName)
        .single();
      expect(group).not.toBeNull();
      groupId = group!.id;
      for (const column of columns!) {
        await expect(dialog.getByLabel(`Group for ${column.name}`, { exact: true })).toBeEnabled();
        await dialog.getByLabel(`Group for ${column.name}`, { exact: true }).selectOption(String(groupId));
        await expect
          .poll(async () => {
            const { data } = await supabase.from("gradebook_columns").select("group_id").eq("id", column.id).single();
            return data?.group_id;
          })
          .toBe(groupId);
      }
      await expect(dialog.getByRole("button", { name: `Rename ${groupName}`, exact: true })).toBeEnabled();
      await dialog.getByRole("button", { name: `Rename ${groupName}`, exact: true }).click();
      await dialog.getByLabel("Rename group", { exact: true }).fill(renamed);
      await dialog.getByRole("button", { name: "Save name", exact: true }).click();
      await expect(dialog.getByRole("button", { name: `Move ${renamed} earlier`, exact: true })).toBeEnabled();
      await dialog.getByRole("button", { name: `Move ${renamed} earlier`, exact: true }).click();
      await expect(dialog.getByRole("button", { name: `Move ${renamed} later`, exact: true })).toBeEnabled();
      await page.reload();
      await page.getByRole("button", { name: "Manage groups", exact: true }).click();
      for (const column of columns!) {
        await expect(dialog.getByLabel(`Group for ${column.name}`, { exact: true })).toHaveValue(String(groupId));
      }
      await dialog.getByRole("button", { name: `Delete ${renamed}`, exact: true }).click();
      for (const column of columns!) {
        await expect(dialog.getByLabel(`Group for ${column.name}`, { exact: true })).toHaveValue("");
      }
      const after = await supabase
        .from("gradebook_column_students")
        .select("*", { count: "exact", head: true })
        .in(
          "gradebook_column_id",
          columns!.map((column) => column.id)
        );
      expect(after.count).toBe(before.count);
    } finally {
      for (const column of columns ?? []) {
        await supabase.from("gradebook_columns").update({ group_id: column.group_id }).eq("id", column.id);
      }
      if (groupId !== undefined) await supabase.from("gradebook_column_groups").delete().eq("id", groupId);
    }
  });

  test("dragging a collapsed group preserves membership and survives reload", async ({ page }) => {
    const course = await findSeededClass();
    const instructor = await findInstructor(course.id);
    const { data: groups } = await supabase
      .from("gradebook_column_groups")
      .select("id, name, sort_order")
      .eq("class_id", course.id)
      .order("sort_order");
    const { data: columns } = await supabase
      .from("gradebook_columns")
      .select("id, group_id, sort_order")
      .eq("class_id", course.id)
      .order("id");
    expect(groups!.length).toBeGreaterThan(2);
    const first = groups![0];
    const second = groups![1];
    const { data: emptyGroup, error: emptyError } = await supabase
      .from("gradebook_column_groups")
      .insert({
        class_id: course.id,
        gradebook_id: course.gradebook_id!,
        name: "Empty drag fixture",
        sort_order: first.sort_order
      })
      .select("id")
      .single();
    if (emptyError) throw emptyError;
    try {
      await loginAsUser(page, instructor, course);
      await page.goto(`/course/${course.id}/manage/gradebook`);
      await page.getByRole("button", { name: "Collapse all groups", exact: true }).click();
      const memberHeaders = (groupId: number) =>
        page.locator(
          columns!
            .filter((column) => column.group_id === groupId)
            .map((column) => `[role="columnheader"][data-col-id="grade_${column.id}"]`)
            .join(",")
        );
      await expect(memberHeaders(first.id)).toHaveCount(1);
      await expect(memberHeaders(second.id)).toHaveCount(1);
      const handle = memberHeaders(second.id).getByLabel("Drag to reorder column");
      await handle.click({ trial: true, timeout: 10000 });
      const source = await handle.boundingBox();
      const target = await memberHeaders(first.id).boundingBox();
      expect(source).not.toBeNull();
      expect(target).not.toBeNull();
      await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
      await page.mouse.down();
      await page.mouse.move(source!.x - 15, source!.y + source!.height / 2, { steps: 3 });
      await expect(handle).toHaveAttribute("aria-pressed", "true");
      // closestCenter compares the dragged header's center, not the pointer on its left-hand grip.
      await page.mouse.move(target!.x - target!.width / 2 + 5, source!.y + source!.height / 2, { steps: 12 });
      await page.mouse.up();
      await expect
        .poll(async () => {
          const { data } = await supabase
            .from("gradebook_column_groups")
            .select("id")
            .eq("class_id", course.id)
            .order("sort_order");
          return data?.[0].id;
        })
        .toBe(second.id);
      const { data: after } = await supabase
        .from("gradebook_columns")
        .select("id, group_id, sort_order")
        .eq("class_id", course.id)
        .order("id");
      expect(after).toEqual(columns);
      const { data: reorderedGroups } = await supabase
        .from("gradebook_column_groups")
        .select("id")
        .eq("class_id", course.id)
        .order("sort_order")
        .order("id");
      expect(reorderedGroups?.map((group) => group.id)).toEqual([
        second.id,
        first.id,
        emptyGroup.id,
        ...groups!.slice(2).map((group) => group.id)
      ]);
      await page.reload();
      await expect(memberHeaders(first.id)).toHaveCount(1);
      await expect(memberHeaders(second.id)).toHaveCount(1);
      expect((await memberHeaders(second.id).boundingBox())!.x).toBeLessThan(
        (await memberHeaders(first.id).boundingBox())!.x
      );
    } finally {
      await supabase.from("gradebook_column_groups").delete().eq("id", emptyGroup.id);
      for (const group of groups ?? []) {
        await supabase.from("gradebook_column_groups").update({ sort_order: group.sort_order }).eq("id", group.id);
      }
    }
  });
});
