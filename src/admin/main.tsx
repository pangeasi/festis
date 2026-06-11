import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Image,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type {
  Festival,
  FestivalImageCandidate,
  FestivalProgramItem,
  FestivalSocialUrl,
  FestivalTicketPrice,
} from '../types';
import './styles.css';

type AdminPayload = {
  count?: number;
  festivals: Festival[];
};

type FormState = {
  name: string;
  slug: string;
  festival_url: string;
  official_url: string;
  ticket_url: string;
  date_text: string;
  start_date: string;
  end_date: string;
  location: string;
  city: string;
  region: string;
  status: string;
  edition: string;
  image_url: string;
  image_full_url: string;
  image_alt: string;
  imageCandidates: FestivalImageCandidate[];
  ticket_price_summary: string;
  description: string;
  stylesText: string;
  artistsText: string;
  socialUrlsText: string;
  ticketPricesText: string;
  programText: string;
  officialSourcesText: string;
};

const emptyForm: FormState = {
  name: '',
  slug: '',
  festival_url: '',
  official_url: '',
  ticket_url: '',
  date_text: '',
  start_date: '',
  end_date: '',
  location: '',
  city: '',
  region: '',
  status: '',
  edition: '',
  image_url: '',
  image_full_url: '',
  image_alt: '',
  imageCandidates: [],
  ticket_price_summary: '',
  description: '',
  stylesText: '',
  artistsText: '',
  socialUrlsText: '[]',
  ticketPricesText: '[]',
  programText: '[]',
  officialSourcesText: '',
};

function App() {
  const [payload, setPayload] = useState<AdminPayload | null>(null);
  const [query, setQuery] = useState('');
  const [llmQuery, setLlmQuery] = useState('');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [isCreating, setIsCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const festivals = payload?.festivals ?? [];
  const selectedFestival = festivals.find((festival) => festival.slug === selectedSlug) ?? null;

  const filteredFestivals = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es-ES');
    if (!normalized) return festivals;
    return festivals.filter((festival) =>
      [festival.name, festival.city, festival.region, festival.location, festival.slug]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('es-ES').includes(normalized)),
    );
  }, [festivals, query]);

  useEffect(() => {
    void loadFestivals();
  }, []);

  useEffect(() => {
    if (selectedFestival && !isCreating) {
      setForm(festivalToForm(selectedFestival));
    }
  }, [isCreating, selectedFestival]);

  async function loadFestivals(nextSelectedSlug = selectedSlug) {
    setError(null);
    const data = await api<AdminPayload>('/api/admin/festivals');
    setPayload(data);
    if (nextSelectedSlug && data.festivals.some((festival) => festival.slug === nextSelectedSlug)) {
      setSelectedSlug(nextSelectedSlug);
      return;
    }
    setSelectedSlug(data.festivals[0]?.slug ?? null);
  }

  function startCreate() {
    setIsCreating(true);
    setSelectedSlug(null);
    setForm(emptyForm);
    setNotice(null);
    setError(null);
  }

  function startEdit(slug: string) {
    setIsCreating(false);
    setSelectedSlug(slug);
    setNotice(null);
    setError(null);
  }

  async function saveForm() {
    setError(null);
    setNotice(null);
    setBusy('save');
    try {
      const body = formToFestival(form);
      const saved = isCreating
        ? await api<Festival>('/api/admin/festivals', { method: 'POST', body })
        : await api<Festival>(`/api/admin/festivals/${selectedSlug}`, { method: 'PUT', body });
      setIsCreating(false);
      await loadFestivals(saved.slug);
      setNotice('Festival guardado.');
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setBusy(null);
    }
  }

  async function createWithLlm() {
    if (!llmQuery.trim()) return;
    setError(null);
    setNotice(null);
    setBusy('create-llm');
    try {
      const result = await api<{ festival: Festival }>('/api/admin/festivals/llm', {
        method: 'POST',
        body: { query: llmQuery },
      });
      setLlmQuery('');
      setIsCreating(false);
      await loadFestivals(result.festival.slug);
      setNotice('Festival creado con LLM.');
    } catch (llmError) {
      setError(getErrorMessage(llmError));
    } finally {
      setBusy(null);
    }
  }

  async function updateWithLlm(slug: string) {
    setError(null);
    setNotice(null);
    setBusy(`llm:${slug}`);
    try {
      const result = await api<{ festival: Festival }>(`/api/admin/festivals/${slug}/llm`, {
        method: 'POST',
        body: {},
      });
      setIsCreating(false);
      await loadFestivals(result.festival.slug);
      setNotice('Festival actualizado con LLM.');
    } catch (llmError) {
      setError(getErrorMessage(llmError));
    } finally {
      setBusy(null);
    }
  }

  async function deleteFestival(slug: string) {
    const festival = festivals.find((item) => item.slug === slug);
    if (!window.confirm(`Eliminar ${festival?.name ?? slug}?`)) return;

    setError(null);
    setNotice(null);
    setBusy(`delete:${slug}`);
    try {
      await api(`/api/admin/festivals/${slug}`, { method: 'DELETE' });
      await loadFestivals(null);
      setNotice('Festival eliminado.');
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setBusy(null);
    }
  }

  async function selectImageCandidate(candidate: FestivalImageCandidate) {
    if (isCreating || !selectedSlug) {
      setForm({
        ...form,
        image_url: candidate.local_url,
        image_full_url: candidate.local_url,
        image_alt: candidate.alt || form.image_alt || form.name,
      });
      return;
    }

    setError(null);
    setNotice(null);
    setBusy(`candidate:${candidate.local_url}`);
    try {
      const festival = await api<Festival>(`/api/admin/festivals/${selectedSlug}/image-candidate`, {
        method: 'POST',
        body: { local_url: candidate.local_url },
      });
      await loadFestivals(festival.slug);
      setNotice('Imagen candidata aplicada.');
    } catch (candidateError) {
      setError(getErrorMessage(candidateError));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">Panel local</p>
          <h1>Festivales</h1>
        </div>
        <div className="admin-header-actions">
          <button className="admin-secondary-button" type="button" onClick={() => void loadFestivals()}>
            <RefreshCw size={18} />
            Recargar
          </button>
          <button className="admin-primary-button" type="button" onClick={startCreate}>
            <Plus size={18} />
            Nuevo
          </button>
        </div>
      </header>

      <section className="admin-llm-bar">
        <div className="admin-search-field">
          <Sparkles size={18} />
          <input
            placeholder="Nombre del festival o URL oficial"
            value={llmQuery}
            onChange={(event) => setLlmQuery(event.target.value)}
          />
        </div>
        <button
          className="admin-primary-button"
          disabled={busy === 'create-llm' || !llmQuery.trim()}
          type="button"
          onClick={() => void createWithLlm()}
        >
          {busy === 'create-llm' ? <Loader2 className="admin-spin" size={18} /> : <Sparkles size={18} />}
          Crear con LLM
        </button>
      </section>

      {(error || notice) && (
        <div className={error ? 'admin-alert admin-alert-error' : 'admin-alert'}>
          {error ?? notice}
        </div>
      )}

      <div className="admin-layout">
        <section className="admin-list-panel">
          <div className="admin-list-toolbar">
            <div className="admin-search-field">
              <Search size={18} />
              <input
                placeholder="Buscar por nombre, ciudad o slug"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <span>{filteredFestivals.length} / {payload?.count ?? festivals.length}</span>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Festival</th>
                  <th>Fecha</th>
                  <th>Lugar</th>
                  <th>Estado</th>
        <th>LLM</th>
                  <th>Imgs</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredFestivals.map((festival) => (
                  <tr
                    className={festival.slug === selectedSlug ? 'is-selected' : ''}
                    key={festival.slug}
                    onClick={() => startEdit(festival.slug)}
                  >
                    <td>
                      <strong>{festival.name}</strong>
                      <small>{festival.slug}</small>
                    </td>
                    <td>{festival.date_text || festival.start_date || 'Pendiente'}</td>
                    <td>{festival.location || festival.city || festival.region || 'Pendiente'}</td>
                    <td>{festival.status || 'Sin estado'}</td>
                    <td>{festival.official_enrichment_confidence || 'No'}</td>
                    <td>{festival.image_candidates?.length ?? 0}</td>
                    <td>
                      <div className="admin-row-actions">
                        <button title="Editar" type="button" onClick={(event) => {
                          event.stopPropagation();
                          startEdit(festival.slug);
                        }}>
                          <Pencil size={16} />
                        </button>
                        <button
                          disabled={busy === `llm:${festival.slug}`}
                          title="Actualizar con LLM"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void updateWithLlm(festival.slug);
                          }}
                        >
                          {busy === `llm:${festival.slug}` ? (
                            <Loader2 className="admin-spin" size={16} />
                          ) : (
                            <Sparkles size={16} />
                          )}
                        </button>
                        <button
                          disabled={busy === `delete:${festival.slug}`}
                          title="Eliminar"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void deleteFestival(festival.slug);
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="admin-editor">
          <div className="admin-editor-head">
            <div>
              <p className="admin-eyebrow">{isCreating ? 'Crear' : 'Editar'}</p>
              <h2>{isCreating ? 'Nuevo festival' : selectedFestival?.name ?? 'Selecciona un festival'}</h2>
            </div>
            {!isCreating && selectedFestival && (
              <button
                className="admin-icon-button"
                title="Cerrar seleccion"
                type="button"
                onClick={() => setSelectedSlug(null)}
              >
                <X size={18} />
              </button>
            )}
          </div>

          {(isCreating || selectedFestival) ? (
            <FestivalForm
              busy={busy}
              form={form}
              isCreating={isCreating}
              onCancel={() => {
                setIsCreating(false);
                setSelectedSlug(festivals[0]?.slug ?? null);
              }}
              onChange={setForm}
              onSelectCandidate={(candidate) => void selectImageCandidate(candidate)}
              onSave={() => void saveForm()}
            />
          ) : (
            <div className="admin-empty">Selecciona un festival o crea uno nuevo.</div>
          )}
        </aside>
      </div>
    </main>
  );
}

function FestivalForm({
  busy,
  form,
  isCreating,
  onCancel,
  onChange,
  onSelectCandidate,
  onSave,
}: {
  busy: string | null;
  form: FormState;
  isCreating: boolean;
  onCancel: () => void;
  onChange: (form: FormState) => void;
  onSelectCandidate: (candidate: FestivalImageCandidate) => void;
  onSave: () => void;
}) {
  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    onChange({ ...form, [key]: value });
  }

  function selectImageCandidate(candidate: FestivalImageCandidate) {
    onSelectCandidate(candidate);
  }

  const currentPreview = form.image_full_url || form.image_url;

  return (
    <form className="admin-form" onSubmit={(event) => {
      event.preventDefault();
      onSave();
    }}>
      <div className="admin-form-grid">
        <label>
          Nombre
          <input required value={form.name} onChange={(event) => update('name', event.target.value)} />
        </label>
        <label>
          Slug
          <input value={form.slug} onChange={(event) => update('slug', event.target.value)} />
        </label>
        <label>
          Fecha texto
          <input value={form.date_text} onChange={(event) => update('date_text', event.target.value)} />
        </label>
        <label>
          Estado
          <input value={form.status} onChange={(event) => update('status', event.target.value)} />
        </label>
        <label>
          Inicio
          <input type="date" value={form.start_date} onChange={(event) => update('start_date', event.target.value)} />
        </label>
        <label>
          Fin
          <input type="date" value={form.end_date} onChange={(event) => update('end_date', event.target.value)} />
        </label>
        <label>
          Ciudad
          <input value={form.city} onChange={(event) => update('city', event.target.value)} />
        </label>
        <label>
          Region
          <input value={form.region} onChange={(event) => update('region', event.target.value)} />
        </label>
        <label className="admin-wide-field">
          Localizacion
          <input value={form.location} onChange={(event) => update('location', event.target.value)} />
        </label>
        <label>
          Edicion
          <input value={form.edition} onChange={(event) => update('edition', event.target.value)} />
        </label>
        <label>
          Resumen entradas
          <input value={form.ticket_price_summary} onChange={(event) => update('ticket_price_summary', event.target.value)} />
        </label>
        <label className="admin-wide-field">
          URL ModoFestival
          <input value={form.festival_url} onChange={(event) => update('festival_url', event.target.value)} />
        </label>
        <label className="admin-wide-field">
          URL oficial
          <input value={form.official_url} onChange={(event) => update('official_url', event.target.value)} />
        </label>
        <label className="admin-wide-field">
          URL entradas
          <input value={form.ticket_url} onChange={(event) => update('ticket_url', event.target.value)} />
        </label>
        <label className="admin-wide-field">
          Imagen listado
          <input value={form.image_url} onChange={(event) => update('image_url', event.target.value)} />
        </label>
        <label className="admin-wide-field">
          Imagen grande
          <input value={form.image_full_url} onChange={(event) => update('image_full_url', event.target.value)} />
        </label>
        <label className="admin-wide-field">
          Alt imagen
          <input value={form.image_alt} onChange={(event) => update('image_alt', event.target.value)} />
        </label>
        <section className="admin-wide-field admin-image-moderation" aria-label="Moderacion de imagen">
          <div className="admin-image-current">
            <div>
              <span>Imagen principal</span>
              <strong>{currentPreview || 'Sin imagen'}</strong>
            </div>
            {currentPreview ? (
              <img alt={form.image_alt || form.name || 'Imagen principal'} src={currentPreview} />
            ) : (
              <div className="admin-image-placeholder">
                <Image size={22} />
              </div>
            )}
          </div>

          {form.imageCandidates.length > 0 && (
            <div className="admin-image-candidates">
              {form.imageCandidates.map((candidate) => {
                const isSelected =
                  candidate.local_url === form.image_url ||
                  candidate.local_url === form.image_full_url;
                return (
                  <button
                    className={isSelected ? 'admin-image-candidate is-selected' : 'admin-image-candidate'}
                    disabled={busy === `candidate:${candidate.local_url}`}
                    key={`${candidate.local_url}-${candidate.original_url}`}
                    type="button"
                    onClick={() => selectImageCandidate(candidate)}
                  >
                    <img alt={candidate.alt || 'Candidata de imagen'} src={candidate.local_url} />
                    <span>
                      <strong>{isSelected ? 'Seleccionada' : 'Usar imagen'}</strong>
                      <small>
                        {[candidate.source, candidate.score !== null ? `score ${candidate.score}` : null]
                          .filter(Boolean)
                          .join(' · ') || 'candidata'}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
        <label className="admin-wide-field">
          Estilos, separados por coma o linea
          <textarea rows={2} value={form.stylesText} onChange={(event) => update('stylesText', event.target.value)} />
        </label>
        <label className="admin-wide-field">
          Artistas, separados por coma o linea
          <textarea rows={3} value={form.artistsText} onChange={(event) => update('artistsText', event.target.value)} />
        </label>
        <label className="admin-wide-field">
          Descripcion
          <textarea rows={4} value={form.description} onChange={(event) => update('description', event.target.value)} />
        </label>
        <label className="admin-wide-field">
          Redes sociales JSON
          <textarea rows={4} value={form.socialUrlsText} onChange={(event) => update('socialUrlsText', event.target.value)} />
        </label>
        <label className="admin-wide-field">
          Precios JSON
          <textarea rows={5} value={form.ticketPricesText} onChange={(event) => update('ticketPricesText', event.target.value)} />
        </label>
        <label className="admin-wide-field">
          Programa JSON
          <textarea rows={6} value={form.programText} onChange={(event) => update('programText', event.target.value)} />
        </label>
        <label className="admin-wide-field">
          Fuentes oficiales, una por linea
          <textarea rows={3} value={form.officialSourcesText} onChange={(event) => update('officialSourcesText', event.target.value)} />
        </label>
      </div>

      <div className="admin-form-actions">
        <button className="admin-secondary-button" type="button" onClick={onCancel}>
          Cancelar
        </button>
        <button className="admin-primary-button" disabled={busy === 'save'} type="submit">
          {busy === 'save' ? <Loader2 className="admin-spin" size={18} /> : <Save size={18} />}
          {isCreating ? 'Crear' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}

function festivalToForm(festival: Festival): FormState {
  return {
    name: festival.name ?? '',
    slug: festival.slug ?? '',
    festival_url: festival.festival_url ?? '',
    official_url: festival.official_url ?? '',
    ticket_url: festival.ticket_url ?? '',
    date_text: festival.date_text ?? '',
    start_date: festival.start_date ?? '',
    end_date: festival.end_date ?? '',
    location: festival.location ?? '',
    city: festival.city ?? '',
    region: festival.region ?? '',
    status: festival.status ?? '',
    edition: festival.edition ?? '',
    image_url: festival.image_url ?? '',
    image_full_url: festival.image_full_url ?? '',
    image_alt: festival.image_alt ?? '',
    imageCandidates: festival.image_candidates ?? [],
    ticket_price_summary: festival.ticket_price_summary ?? '',
    description: festival.description ?? '',
    stylesText: (festival.styles ?? []).join('\n'),
    artistsText: (festival.artists ?? []).join('\n'),
    socialUrlsText: JSON.stringify(festival.social_urls ?? [], null, 2),
    ticketPricesText: JSON.stringify(festival.ticket_prices ?? [], null, 2),
    programText: JSON.stringify(festival.program ?? [], null, 2),
    officialSourcesText: (festival.official_sources ?? []).join('\n'),
  };
}

function formToFestival(form: FormState) {
  return {
    name: form.name,
    slug: form.slug,
    festival_url: nullIfEmpty(form.festival_url),
    official_url: nullIfEmpty(form.official_url),
    ticket_url: nullIfEmpty(form.ticket_url),
    date_text: nullIfEmpty(form.date_text),
    start_date: nullIfEmpty(form.start_date),
    end_date: nullIfEmpty(form.end_date),
    location: nullIfEmpty(form.location),
    city: nullIfEmpty(form.city),
    region: nullIfEmpty(form.region),
    status: nullIfEmpty(form.status),
    edition: nullIfEmpty(form.edition),
    image_url: nullIfEmpty(form.image_url),
    image_full_url: nullIfEmpty(form.image_full_url),
    image_alt: nullIfEmpty(form.image_alt),
    image_candidates: form.imageCandidates,
    ticket_price_summary: nullIfEmpty(form.ticket_price_summary),
    description: nullIfEmpty(form.description),
    styles: splitLines(form.stylesText),
    artists: splitLines(form.artistsText),
    social_urls: parseJsonList<FestivalSocialUrl>(form.socialUrlsText, 'redes sociales'),
    ticket_prices: parseJsonList<FestivalTicketPrice>(form.ticketPricesText, 'precios'),
    program: parseJsonList<FestivalProgramItem>(form.programText, 'programa'),
    official_sources: splitLines(form.officialSourcesText),
  };
}

function splitLines(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJsonList<T>(value: string, label: string): T[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`${label} debe ser un array JSON.`);
  return parsed as T[];
}

function nullIfEmpty(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function api<T = unknown>(url: string, options: { method?: string; body?: unknown } = {}) {
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (response.status === 204) return undefined as T;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error ?? `HTTP ${response.status}`);
  }
  return data as T;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Error inesperado.';
}

createRoot(document.getElementById('admin-root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
