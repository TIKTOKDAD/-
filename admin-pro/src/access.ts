type InitialState = {
  currentUser?: {
    id?: string;
  };
};

export default (initialState: InitialState) => {
  return {
    canSeeAdmin: Boolean(initialState?.currentUser?.id),
  };
};
