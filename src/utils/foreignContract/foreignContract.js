/**
 * @notice this contract is designed for
 * a specific dev env testing only.
 * 
 * 
 * */

export async function handle(state, action) {
  const caller = action.caller;
  const input = action.input;

  const foreignCalls = state.foreignCalls;
  const invocations = state.invocations;

  if (input.function === "deposit") {
    const contract = input.contract;

    const invoc = {
      function: "transferFrom",
      from: "vZY2XY1RD9HIfWi8ift-1_DnHLDadZMWrufSh-_rKF0",
      to: SmartWeave.contract.id,
      qty: 1,
      sig: SmartWeave.transaction.id,
    };

    foreignCalls.push({
      txID: SmartWeave.transaction.id,
      contract: contract,
      input: invoc,
    });

    return { state };
  }

  if (input.function === "transfer") {
    const contract = input.contract;

    const invoc = {
      function: "transfer",
      target: "0r2KrnHC8VenTUmahf3Ig_AK6ChbwS9VcEVf1Zyli44",
      qty: 1,
    };

    foreignCalls.push({
      txID: SmartWeave.transaction.id,
      contract: contract,
      input: invoc,
    });

    return { state };
  }
}
