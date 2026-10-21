export const interests = [
  "Formação de professores",
  "Conhecer as CCAs",
  "Participação da escola",
  "Outros assuntos institucionais",
] as const;
export const limits = {
  name: 100,
  school: 160,
  role: 100,
  city: 120,
  email: 254,
  phone: 25,
  interest: 50,
  message: 3000,
} as const;
export type ContactData = Record<keyof typeof limits, string>;
export const isEmail = (value: string) =>
  value.length <= 254 && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);

export function validateContact(body: unknown): ContactData | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) =>
        !Object.prototype.hasOwnProperty.call(limits, key) && key !== "website",
    )
  )
    return null;
  if (typeof input.website !== "string" || input.website !== "") return null;
  const data = {} as ContactData;
  for (const key of Object.keys(limits) as (keyof ContactData)[]) {
    if (typeof input[key] !== "string" || input[key].length > limits[key])
      return null;
    const value = input[key].trim();
    if (key !== "phone" && !value) return null;
    if (
      Array.from(value).some((char) => {
        const code = char.charCodeAt(0);
        return (
          code === 127 ||
          (code < 32 && !(key === "message" && [9, 10, 13].includes(code)))
        );
      })
    )
      return null;
    data[key] = value;
  }
  if (data.name.length < 2 || data.message.length < 10 || !isEmail(data.email))
    return null;
  if (data.phone && !/^\+?[\d\s().-]{8,25}$/.test(data.phone)) return null;
  if (!interests.some((value) => value === data.interest)) return null;
  return data;
}
