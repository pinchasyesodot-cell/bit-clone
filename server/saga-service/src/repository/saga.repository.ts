import type { Saga } from "../interfaces/SagaType.js";
import { sagaModel } from "../models/sagaModel.js";

export class SagaRepository {
  static createSaga = async (saga: Saga) => {
    const newSaga = new sagaModel(saga);
    return (await newSaga.save()).toJSON() as Saga;
  }
}
