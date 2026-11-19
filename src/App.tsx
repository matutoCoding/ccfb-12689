import { useState } from 'react';
import { AppLayout, type PageKey } from './components/AppLayout';
import { appStore } from './state/app';
import { SchemesPage } from './pages/SchemesPage';
import { WindowsPage } from './pages/WindowsPage';
import { MaterialsPage } from './pages/MaterialsPage';
import { EditorPage } from './pages/editor/EditorPage';
import { ConfirmPage } from './pages/ConfirmPage';

export default function App() {
  const [page, setPage] = useState<PageKey>('schemes');
  const currentSchemeId = appStore.useStore((s) => s.currentSchemeId);

  const openEditor = (schemeId: string) => {
    appStore.patch({ currentSchemeId: schemeId });
    setPage('editor');
  };

  return (
    <AppLayout page={page} onNav={setPage}>
      {page === 'schemes' && <SchemesPage onOpen={openEditor} onNav={setPage} />}
      {page === 'windows' && <WindowsPage />}
      {page === 'materials' && <MaterialsPage />}
      {page === 'editor' && <EditorPage schemeId={currentSchemeId} onBack={() => setPage('schemes')} />}
      {page === 'confirm' && <ConfirmPage onOpen={openEditor} />}
    </AppLayout>
  );
}
