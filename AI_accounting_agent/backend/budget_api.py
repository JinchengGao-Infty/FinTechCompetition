"""Inject existing session/CSRF verification AND trusted actor resolution.

create_budget_router(store, trusted_actor) expects a synchronous callable
trusted_actor(Request)->str. It must validate the existing session on ALL requests
and existing origin/CSRF on PUT, then return the server-resolved actor (not SID).
No credentials, session minting, app import, or default actor are provided here.
"""
from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response
from budget_store import BudgetError


def create_budget_router(store, trusted_actor):
    router = APIRouter(prefix='/finance/budget', tags=['budget'])

    def actor(request: Request):
        value = trusted_actor(request)
        if not isinstance(value, str) or not value.strip():
            raise HTTPException(401, 'Trusted actor unavailable')
        return value

    def call(fn, *args):
        try:
            return fn(*args)
        except BudgetError as error:
            raise HTTPException(error.status_code, error.detail) from error

    @router.get('')
    def get_budget(response: Response, month: str, owner: str = Depends(actor)):
        response.headers['Cache-Control'] = 'no-store'
        return call(store.get, owner, month)

    @router.put('')
    def put_budget(response: Response, month: str, payload: dict = Body(...), owner: str = Depends(actor)):
        response.headers['Cache-Control'] = 'no-store'
        if set(payload) != {'total_minor','categories','expected_revision','request_id'}:
            raise HTTPException(422, 'Expected total_minor, categories, expected_revision, request_id only')
        return call(store.save, owner, month, payload['total_minor'], payload['categories'], payload['expected_revision'], payload['request_id'])

    return router
