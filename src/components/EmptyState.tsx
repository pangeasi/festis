type EmptyStateProps = {
  onReset: () => void;
};

export function EmptyState({ onReset }: EmptyStateProps) {
  return (
    <section className="empty-state">
      <h2>No hay festivales con esos filtros</h2>
      <button onClick={onReset} type="button">
        Restablecer busqueda
      </button>
    </section>
  );
}
