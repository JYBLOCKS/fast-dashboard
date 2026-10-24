export const readData = async <T>(file: string): Promise<T> => {
  const response = await fetch(`/api/data/${file}`);
  if (!response.ok) throw new Error(`Unable to read ${file}`);
  return response.json() as Promise<T>;
};

export const writeData = async <T>(file: string, value: T): Promise<void> => {
  const response = await fetch(`/api/data/${file}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
  if (!response.ok) throw new Error(`Unable to write ${file}`);
};
