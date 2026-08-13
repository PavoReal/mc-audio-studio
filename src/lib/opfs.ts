function segments(path: string): string[] {
  const result = path.split("/").filter(Boolean);
  if (!result.length || result.some((part) => part === "." || part === ".." || part.includes("\0"))) {
    throw new Error(`Invalid private file path: ${path}`);
  }
  return result;
}

async function root(): Promise<FileSystemDirectoryHandle> {
  if (!navigator.storage?.getDirectory) {
    throw new Error("This browser does not support origin-private file storage.");
  }
  return navigator.storage.getDirectory();
}

async function parentFor(path: string, create: boolean): Promise<[FileSystemDirectoryHandle, string]> {
  const parts = segments(path);
  const filename = parts.pop()!;
  let directory = await root();
  for (const part of parts) {
    directory = await directory.getDirectoryHandle(part, { create });
  }
  return [directory, filename];
}

export async function writeBlobAtomic(path: string, blob: Blob): Promise<void> {
  const [directory, filename] = await parentFor(path, true);
  const temporaryName = `${filename}.tmp-${crypto.randomUUID()}`;
  const temporary = await directory.getFileHandle(temporaryName, { create: true });
  const stream = await temporary.createWritable();
  try {
    await stream.write(blob);
    await stream.close();
    const destination = await directory.getFileHandle(filename, { create: true });
    const destinationStream = await destination.createWritable();
    await destinationStream.write(await temporary.getFile());
    await destinationStream.close();
  } finally {
    await directory.removeEntry(temporaryName).catch(() => undefined);
  }
}

export async function readBlob(path: string): Promise<File> {
  const [directory, filename] = await parentFor(path, false);
  return (await directory.getFileHandle(filename)).getFile();
}

export async function removePrivateFile(path: string): Promise<void> {
  const [directory, filename] = await parentFor(path, false);
  await directory.removeEntry(filename).catch(() => undefined);
}

export async function storageEstimate(requestPersistence = false) {
  const persisted = requestPersistence && navigator.storage.persist
    ? await navigator.storage.persist().catch(() => false)
    : navigator.storage.persisted
      ? await navigator.storage.persisted().catch(() => false)
      : false;
  const estimate = await navigator.storage.estimate();
  return {
    usage: estimate.usage ?? 0,
    quota: estimate.quota ?? 0,
    persisted
  };
}
