import { useInterfacePrefs } from "@context/InterfacePrefsContext";

type Props = { id: string; children: React.ReactNode };

export default function HideableSection({ id, children }: Props) {
  const { hiddenSections } = useInterfacePrefs();
  if (hiddenSections.includes(id)) return null;
  return <>{children}</>;
}
