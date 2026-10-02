export function PreparedNotice({ prepared }: { prepared?: boolean }) {
  return prepared ? <p className="gc-prepared" role="note">Prepared example · illustrative results · no provider calls. Create an ordinary configuration to run your own research.</p> : null;
}
