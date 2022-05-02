/**                                                                                   
 * 
 * 
 * 
 *                          
 *                               ░█████╗░███╗░░██╗███████╗████████╗
 *                               ██╔══██╗████╗░██║██╔════╝╚══██╔══╝
 *                               ███████║██╔██╗██║█████╗░░░░░██║░░░
 *                               ██╔══██║██║╚████║██╔══╝░░░░░██║░░░
 *                               ██║░░██║██║░╚███║██║░░░░░░░░██║░░░
 *                               ╚═╝░░╚═╝╚═╝░░╚══╝╚═╝░░░░░░░░╚═╝░░░
 * 
 *
 * 
 * @author charmful0x
 * @notice testing contract. 
 * DO NOT USE IT IN PRODUCTION
 *  
 **/



export async function handle(state, action) {
  const input = action.input;
  const caller = action.caller;

  // STATE
  const balances = state.balances;
  const name = state.name;
  const ticker = state.ticker;
  const invocations = state.invocations;
  const foreignCalls = state.foreignCalls;
  const invokedForeignRequests = state.invokedForeignRequests;
  const pendingForeignRequests = state.pendingForeignRequests;
  const allowance = state.allowance;

  // ERRORS
  const ERROR_CALLER_NOT_FOUND = "caller not found in balances";
  const ERROR_UNSUFFFICIENT_BALANCE = "caller has unsufficient balance";
  const ERROR_INVALID_TRANSFER =
    "zero qty, float qty, and self transfers are not possible";
  const ERROR_INVALID_ARWEAVE_ADDRESS =
    "the given string is not a valid Arweave address";
  const ERROR_INVALID_INVOCATION =
    "the passed invocation object does not have a valid syntax";
  const ERROR_DOUBLE_SPENDING = "cannot pass the same signature twice";
  const ERROR_ALLOWANCE_NOT_GRANTED = "allowance not granted for the caller";
  const ERROR_UNSUFFFICIENT_ALLOWANCE =
    "transfer qty is greater than the granted allowance";
  const ERROR_UNSUFFFICIENT_GRANTOR_BALANCE =
    "the grantor has balance lower than the granted allowance";
  const ERROR_INVALID_FOREIGN_CONTRACT =
    "the given contract is not FCP-compatible";
  const ERROR_UNSUPPORTED_INVOCATION =
    "a non supported function has been foreign-called";
  const ERROR_SIG_NOT_PASSED = "foreign call does not include a signature";
  const ERROR_INVALID_SIGNATURE =
    "the foreign call TXID and the signature must be identical";

  if (input.function === "balanceOf") {
    /**
     * @dev return the balance of an address
     * @param _address base64url string (Arweave valid address).
     * This parameter is optional, if `_address` is not defined,
     * assign it to action.caller address
     *
     * @return state
     **/

    const _address = input.address || caller;

    _validateArweaveAdress(_address);

    const balance = balances[_address] ? balances[_address] : 0;

    return {
      result: {
        balance: balance,
      },
    };
  }

  if (input.function === "supply") {
    /**
     * @dev return the current total supply
     * of the aNFT rathen than a single address
     * holdings - sum of state.balances
     **/

    const supply = Object.values(balances).reduce((a, b) => a + b, 0);

    return {
      result: {
        supply: supply,
      },
    };
  }

  if (input.function === "transfer") {
    /**
     * @dev transfer aNFT token balance
     * from the caller's balance to the
     * _target address.
     *
     * @param _target the target Arweave address
     * @param _qty transfer amount
     *
     * @return state
     *
     **/

    const _target = input.target;
    const _qty = input.qty;

    _validateArweaveAdress(_target);

    ContractAssert(caller in balances, ERROR_CALLER_NOT_FOUND);
    ContractAssert(balances[caller] > _qty, ERROR_UNSUFFFICIENT_BALANCE);
    ContractAssert(_qty >= 0 || _target !== caller, ERROR_INVALID_TRANSFER);
    ContractAssert(Number.isInteger(_qty), ERROR_INVALID_TRANSFER);

    _target in balances
      ? (balances[_target] += _qty)
      : (balances[_target] = _qty);

    balances[caller] -= _qty;

    return { state };
  }

  if (input.function === "transferFrom") {
    /**
     * @dev transfer tokens from the balance
     * of a user that delegated tokens allowance
     * to any other address on behalf of the delegator.
     *
     * @param _from the delegator address
     * @param _to target's Arweave address
     * @param _sig the TXID of the invocation
     * of this function -`transferFrom()`- in
     * the foreign contract.
     *
     **/

    const _from = input.from;
    const _to = input.to;
    const _qty = input.qty;
    const _sig = input.sig;

    _validateArweaveAdress(_from);
    _validateArweaveAdress(_sig);
    _validateArweaveAdress(_to);

    // protect from double-spending attack
    ContractAssert(
      !invokedForeignRequests.includes(_sig),
      ERROR_DOUBLE_SPENDING
    );

    ContractAssert(Number.isInteger(_qty), ERROR_INVALID_TRANSFER);
    ContractAssert(_from !== _to, ERROR_INVALID_TRANSFER);
    ContractAssert(_from !== caller, ERROR_INVALID_TRANSFER);
    ContractAssert(!!allowance?.[_from]?.[caller], ERROR_ALLOWANCE_NOT_GRANTED);
    ContractAssert(
      allowance[_from][caller] > _qty,
      ERROR_UNSUFFFICIENT_ALLOWANCE
    );
    ContractAssert(!!balances[_from], ERROR_UNSUFFFICIENT_GRANTOR_BALANCE);

    ContractAssert(balances[_from] > _qty, ERROR_UNSUFFFICIENT_BALANCE);

    invokedForeignRequests.push(_sig);

    allowance[_from][caller] -= _qty;
    balances[_from] -= _qty;
    balances[_to] ? (balances[_to] += _qty) : (balances[_to] = _qty);

    return { state };
  }

  if (input.function === "readOutbox") {
    /**
     * @dev read the foreign invocations
     * from a foreign contract and evaluate
     * this contract state.
     *
     * @param _contract the foreign SWC ID
     *
     * @return state
     **/

    const _contract = input.contract;

    _validateArweaveAdress(_contract);

    const foreignState = await SmartWeave.contracts.readContractState(
      _contract
    );
    ContractAssert(
      !!foreignState?.foreignCalls,
      ERROR_INVALID_FOREIGN_CONTRACT
    );

    const awaitingInvocations = foreignState?.foreignCalls.filter(
      (call) =>
        call["contract"] === SmartWeave.contract.id &&
        !state.invocations.includes(call["txID"])
    );

    let res;

    for (let call of awaitingInvocations) {
      // verify that the invocation's function
      // is whitelisted for foreign requests.
      _validatedForeignInvokedFc(call.input);

      const newAction = action;
      newAction.caller = _contract;
      newAction.input = call.input;

      // Run invocation
      const resultState = await handle(state, newAction);

      // saving additional metadata in the state
      // when the foreign function is `transferFrom()`
      if (call.input.function === "transferFrom") {
        _validateInvokedForeignRequests(call);
      }

      // Push invocation to executed invocations
      invocations.push(call.txID);
      res = resultState;
    }

    return res;
  }

  if (input.function === "invoke") {
    /**
     * @dev create an interaction that
     * has action on a foreign contract.
     *
     * @param _contract the foreign SWC ID
     * @param _invocation the foreign interaction
     * input object
     *
     **/

    const _contract = input.contract;
    const _invocation = input.invocation;

    _validateArweaveAdress(_contract);
    _validateInvocationObject(_invocation);

    invocations.push({
      txID: SmartWeave.transaction.id,
      input: _invocation,
      contract: _contract,
    });

    return { state };
  }

  if (input.function === "approve") {
    /**
     * @dev add spending limit for an
     * address or a smartcontract (for FCP-extended)
     *
     * @param _address the user to give him allowance
     * @param _amount spending qty limit
     *
     * @return state
     *
     **/

    const _address = input.address;
    const _amount = input.amount;

    _validateArweaveAdress(_address);

    ContractAssert(
      Number.isInteger(_amount) || _amount > 0,
      ERROR_INVALID_TRANSFER
    );
    ContractAssert(caller in balances, ERROR_CALLER_NOT_FOUND);
    ContractAssert(balances[caller] > _amount, ERROR_UNSUFFFICIENT_BALANCE);

    allowance[caller]
      ? allowance[caller][_address]
        ? (allowance[caller][_address] += _amount)
        : (allowance[caller][_address] = _amount)
      : (allowance[caller] = { [_address]: _amount });

    return { state };
  }

  // HELPER FUNCTIONS
  function _validateArweaveAdress(address) {
    /**
     * @dev validate the syntax of an Arweave
     * EOA/SWC address or TXID.
     *
     * @param address base64url, 43 char string
     *
     * @return address
     **/
    ContractAssert(
      /[a-z0-9_-]{43}/i.test(address),
      ERROR_INVALID_ARWEAVE_ADDRESS
    );

    return address;
  }

  function _validateInvocationObject(invocation) {
    /**
     * @dev validate the foreign interaction
     * object's syntax. And ensure that it has
     * the `function` property.
     *
     * @param invocation foreign invocation's input object
     *
     **/

    if (Object.prototype.toString.call(invocation) !== "[object Object]") {
      throw new ContractError(ERROR_INVALID_INVOCATION);
    }

    ContractAssert(invocation?.function, ERROR_INVALID_INVOCATION);
  }

  function _validatedForeignInvokedFc(input) {
    /**
     * @dev ensure that the foreign invocations
     * read by invoking `readOutbox()` are whitelisted
     * functions.
     * @param input the foreign invocation's input object
     **/

    ContractAssert(
      ["transfer", "transferFrom"].includes(input?.function),
      ERROR_UNSUPPORTED_INVOCATION
    );
  }

  function _validateInvokedForeignRequests(request) {
    /**
     * @dev when the foreign interaction is read
     * by `readOutBox()` and the foreign interaction
     * is a `transferFrom()` invocation, then save
     * the `invocation.sig` in the
     * state.invokedForeignRequests.
     *
     * Thus, any foreign contract can request and verify
     * an aNFT deposit transfer into it.
     *
     * @param request the foreign invocation
     * @param currentState the state passed by `readOutbox()`
     **/

    ContractAssert(!!request?.input?.sig, ERROR_SIG_NOT_PASSED);
    // validate the TXID syntax
    _validateArweaveAdress(request.input.sig);

    ContractAssert(request.input.sig === request.txID, ERROR_INVALID_SIGNATURE);
  }
}
