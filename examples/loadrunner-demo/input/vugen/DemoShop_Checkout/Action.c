/*
 * DemoShop_Checkout - Action
 * Repeated every iteration: search -> create cart -> add item -> checkout.
 * Uses the session token and CSRF token saved in vuser_init.
 */

/*
 * Custom helper: builds an order reference like "TGJ-tester-0042".
 * This is plain C with no direct JMeter or k6 equivalent, so a migration
 * tool has to translate it by hand (or flag it for review).
 */
char *build_order_ref(char *user, int iteration)
{
	static char ref[64];
	sprintf(ref, "TGJ-%s-%04d", user, iteration % 10000);
	return ref;
}

Action()
{
	static int iteration = 0;
	iteration++;

	/* ---------- 02_Search ---------- */
	lr_start_transaction("02_Search");

	web_reg_find("Text=\"count\"", "Fail=NotFound", LAST);

	web_url("search",
		"URL={pBaseUrl}/api/products?q={pSearch}",
		"Resource=0",
		"Mode=HTTP",
		LAST);

	lr_end_transaction("02_Search", LR_AUTO);

	lr_think_time(3);

	/* ---------- 03_CreateCart ---------- */
	lr_start_transaction("03_CreateCart");

	/* Correlation from a JSON response */
	web_reg_save_param_json(
		"ParamName=cCartId",
		"QueryString=$.cartId",
		SEARCH_FILTERS,
		"Scope=Body",
		LAST);

	web_custom_request("create_cart",
		"URL={pBaseUrl}/api/cart",
		"Method=POST",
		"Resource=0",
		"EncType=application/json",
		"Mode=HTTP",
		"Body={}",
		LAST);

	lr_end_transaction("03_CreateCart", LR_AUTO);

	lr_think_time(2);

	/* ---------- 04_AddItem ---------- */
	lr_start_transaction("04_AddItem");

	web_reg_find("Text=\"total\"", "Fail=NotFound", LAST);

	web_custom_request("add_item",
		"URL={pBaseUrl}/api/cart/{cCartId}/items",
		"Method=POST",
		"Resource=0",
		"EncType=application/json",
		"Mode=HTTP",
		"Body={\"productId\":{pProductId},\"qty\":1}",
		LAST);

	lr_end_transaction("04_AddItem", LR_AUTO);

	lr_think_time(2);

	/* ---------- 05_Checkout ---------- */
	lr_save_string(build_order_ref(lr_eval_string("{pUser}"), iteration), "cOrderRef");
	web_add_header("X-Order-Ref", "{cOrderRef}");

	lr_start_transaction("05_Checkout");

	/* SaveCount instead of Fail=NotFound: the pass/fail decision is made below */
	web_reg_find("Text=\"status\":\"CONFIRMED\"", "SaveCount=confirmCount", LAST);

	web_custom_request("checkout",
		"URL={pBaseUrl}/api/checkout",
		"Method=POST",
		"Resource=0",
		"EncType=application/json",
		"Mode=HTTP",
		"Body={\"cartId\":\"{cCartId}\"}",
		LAST);

	if (atoi(lr_eval_string("{confirmCount}")) > 0) {
		lr_end_transaction("05_Checkout", LR_PASS);
	} else {
		lr_error_message("Checkout not confirmed for cart %s", lr_eval_string("{cCartId}"));
		lr_end_transaction("05_Checkout", LR_FAIL);
	}

	lr_think_time(5);

	return 0;
}
