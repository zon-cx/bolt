# SAP Customer Data Cloud

Generated on: 2025-06-09 22:30:01 GMT+

SAP Customer Data Cloud | SHIP

Public

Original content: https://help.sap.com/docs/SAP_CUSTOMER_DATA_CLOUD/8b8d6fffe113457094a17701f63e3d6a?locale=en-

US&state=PRODUCTION&version=SHIP

#### Warning

This document has been generated from SAP Help Portal and is an incomplete version of the official SAP product documentation.

The information included in custom documentation may not reect the arrangement of topics in SAP Help Portal, and may be

missing important aspects and/or correlations to other topics. For this reason, it is not for production use.

For more information, please visit https://help.sap.com/docs/disclaimer.


## accounts.getAccountInfo REST

This method retrieves account data for the specied user.

## Request URL

##### https://accounts.<data-center>/accounts.getAccountInfo

Where <data-center> is:

##### us1.gigya.com - For the US data center.

##### eu1.gigya.com - For the European data center.

##### au1.gigya.com - For the Australian data center.

##### eu2.gigya.com - For the European Azure data center.

##### cn1.sapcdm.cn - For the Chinese data center.

##### global.gigya.com - For all Global site groups.

If you are not sure of your site's data center, see Finding Your Data Center.

## Parameters

```
Required Name Type Description
```
```
UID string The unique ID of the user for
which to retrieve data. Use
either this parameter or
regToken.
```
```
If you call this method through
an external OAuth2 SDK, then
the UID may be passed
implicitly within the
access_token.
```
```
regToken string The regToken returned from
accounts.initRegistration,
accounts.register, or
accounts.login API calls when
the registration process has not
been nalized.
```
####  Note

```
If more than ve concurrent requests are in process with the same UID, all additional requests for the UID are rejected with a
409030 errorCode and errorMessage 'Too many requests for same user'.
```
####  Note

```
The regToken you receive
from SAP Customer Data
```

Required Name Type Description

```
Note: You are required to pass only one of the parameters - either UID or regToken.
```
```
include string This parameter accepts a
comma-separated list of
additional account elds to
retrieve and include in the
response. The possible values
are:
```
```
identities-active
```
```
identities-all
```
```
identities-global
```
```
loginIDs
```
```
emails
```
```
prole
```
```
data
```
```
memberships
```
```
password
```
```
isLockedOut
```
```
lastLoginLocation
```
```
regSource
```
```
irank - deprecated
```
```
rba
```
```
subscriptions
```
```
userInfo - deprecated
```
```
preferences
```
```
groups
```
```
internal
```
```
customIdentiers
```
```
The default value is
"prole,data" so if this
parameter is not used, the
response returns the Prole and
data objects.
```
```
Note: Make sure the parameter
does not contain spaces
between the values.
```
```
extraProleFields string languages, address, phones,
education, educationLevel,
honors, publications, patents,
```
```
Cloud is valid for only 1 hour.
```

Required Name Type Description

```
certications,
professionalHeadline, bio,
industry, specialties, work,
skills, religion, politicalView,
interestedIn,
relationshipStatus, hometown,
favorites,followersCount,
followingCount, username,
name, locale, veried,timezone,
likes,samlData.
```
```
format string Determines the format of the
response.
```
```
json (default)
```
```
context string/JSON This parameter may be used to
pass data through the current
method and return it,
unchanged, within the response.
```
```
ignoreInterruptions Boolean This may be used in some cases
to suppress logic applied by the
Web SDK, such as automatic
opening of screens (for
example, in a registration
completion scenario). This
parameter may not be used with
REST APIs.
```
```
httpStatusCodes Boolean The default value of this
parameter is false, which means
that the HTTP status code in
SAP Customer Data Cloud's
response is always 200 (OK),
even if an error occurs. The
error code and message is given
within the response data (see
below). If this parameter is set
to true, the HTTP status code in
SAP Customer Data Cloud's
response would reect an error,
if one occurred.
```
```
includeCommunications String Two parameters are acceptable:
```
```
comma-separated list of
combinations of
communication channel
& communication topic
to which the user is
opted in/out, along with
all the additional
communication
parameters dened for
these combinations. For
details, see
Communication Topics.
```

Required Name Type Description

```
all - all communication
topics to which the user
is opted in/out/noticed,
along with all the
parameters dened for
these combinations.
```
```
ndBy JSON object An object containing the list of
user identiers belonging to the
user to retrieve. You can use any
of the below:
```
```
_phoneNumber, i.e.
{“_phoneNumber”:
“0123456789”}
```
```
_email, i.e. {“_email”:
“a@b.com”}
```
```
_username, i.e.
{“_username”:
“my_username”}
```
```
_uid, i.e. {“_uid”: “.....”}
```
```
Custom Identier (for
details, see Custom
Login Identiers, i.e.
{"Custom_identier":
"Custom user ID"}, as
follows:
```
```
Custom
identier – the
custom
identier
dened in the
system, for
example
Loyalty_Number.
```
```
User’s custom
ID
```
```
The user can belong to any site
dened on any of your data
centers.
```
```
If either the custom identier or
the custom user ID is not
congured in the system, the
error message is ʻUnauthorized
user’ in both cases.
```
```
Note: Use either _uid or any of
the other parameters to retrieve
the user account, but not
together. _uid has the higher
priority and the data is retrieved
for the user indicated in the _uid
```

```
Required Name Type Description
```
```
parameter, not the data for the
user indicated in any of the
other parameters.
```
```
All identiers are case-sensitive,
meaning that _username is
valid, but _userName is not
valid.
```
## Authorization Parameters

Each REST API request must contain identication and authorization parameters.

Some REST APIs may function without these authorization parameters, however, when that occurs, these calls are treated as

client-side calls and all client-side rate limits will apply. In order to not reach client-side IP rate limits that may impact your

implementation when using server-to-server REST calls, it is Recommended Best Practice to always use an application key and

secret or a bearer token when sending requests. A non-exhaustive list of REST APIs that this may apply to are as follows:

```
accounts.login
```
```
socialize.login
```
```
accounts.notifyLogin
```
```
socialize.notifyLogin
```
```
accounts.nalizeRegistration
```
```
accounts.linkAccounts
```
Please refer to the Authorization Parameters section for details.

## Sample Requests

####  Note

```
Internal elds, are returned only in the accounts.search and the accounts.getAccountInfo REST API server-side calls, with the
proper parameters and group permissions.
```
####  Note

```
As of January 31, 2023, you may no longer use a Partner Secret as a valid authentication method for requests to SAP Customer
Data Cloud servers.
```
####  Note

```
In the following code examples, all references to secret or secretKey are referring to the secret that corresponds to the
userKey (Application key) provided in the request, and NOT to your Partner secret located in the SAP Customer Data Cloud
Dashboard.
```

## Response Data

```
Field Type Description
```
```
inTransition Boolean Returned only for Global sites: Indicates whether this
account is currently in transition, i.e.
accounts.global.changeAccountResidency has been called
for this account and it is currently transferred between
data centers. When the account is in transition, changes
may not be made to the account, and attempting to specify
this account in any other endpoint will result in an error.
```
```
apiVersion integer Denes the API version that returned the response and
may not always be returned.
```
```
callId string Unique identier of the transaction, for debugging
purposes.
```
```
errorCode integer The result code of the operation. Code '0' indicates
success, any other number indicates failure. For a complete
list of error codes, see the Error Codes table.
```

Field Type Description

errorDetails string This eld will appear in the response only in case of an

```
error and will contain the exception info, if available.
```
errorMessage string A short textual description of an error, associated with the

```
errorCode, for logging purposes. This eld will appear in the
response only in case of an error.
```
fullEventName string The full name of the event that triggered the response. This

```
is an internally used parameter that is not always returned
and should not be relied upon by your implementation.
```
time string The time of the response represented in ISO 8601 format:

```
yyyy-mm-dd-Thh:MM:ss.SSSZ (for example, 2021-03-
05T06:11:31.513Z)
```
statusCode integer The HTTP response code of the operation. Code '200'

```
indicates success.
```
```
This property is deprecated and only returned for backward
compatibility.
```
statusReason string A brief explanation of the status code.

```
This property is deprecated and only returned for backward
compatibility.
```
UID string The unique user ID. This user ID should be used for login

```
verication. See User.UID for more information.
```
created string The UTC time the account was created in ISO 8601 format,

```
for example, "1997-07-16T19:20:30Z".
```
createdTimestamp integer The UTC time the account was created in Unix time format

```
including milliseconds (i.e., the number of seconds since
Jan. 1st 1970 * 1000).
```
data JSON object Custom data. Any data that you want to store regarding the

```
user that isn't part of the Prole object.
```
emails JSON object The email addresses belonging to the user. This object

```
includes the following elds:
```
```
veried - an array of strings representing the user's
veried email addresses
```
```
unveried - an array of strings representing the
user's unveried email addresses.
```
```
Note: emails must be specied explicitly in the include
parameter in order to be included in the response.
```
groups JSON object When using CIAM for B2B, this is where the user's

```
Organization Management data is stored. For a detailed
Description of this eld, see the Groups object
documentation.
```
identities array An array of Identity Objects, each object represents a

```
user's social identity. Each Identity Object contains
imported data from a social network that the user has
connected to.
```

Field Type Description

```
Note: You must explicitly specify identities within the
include parameter for them to be included in the response:
identities-active , identities-all, or identities-global to
return only active identities, all identities of a site, or all
identities of a site group, respectively.
```
iRank integer Inuencer rank of the user. This property is deprecated

```
and will always return 0.
```
isActive Boolean Indicates whether the account is active. The account is
active once the user creates it even without nalizing it.
The account can be deactivated, but it will still be
registered if the registration process has been nalized. If
isActive==false the user cannot log in, however any
currently active sessions remain valid.

isLockedOut Deprecated This property is deprecated' use lockedUntil instead.

isRegistered Boolean Indicates whether the user is registered. The user is

```
registered once his registration has been nalized.
```
isVeried Boolean Indicates whether the account email is veried.

lastLogin string The time of the last login of the user in ISO 8601 format, for
example, "1997-07-16T19:20:30Z".

lastLoginLocation JSON object The user's last login location, derived from IP address. This

```
object includes the following elds:
```
```
country - a string representing the two-character
country code.
```
```
state - a string representing the state, where
available.
```
```
city - a string representing the city name.
```
```
coordinates - an object containing:
```
```
lat - a double representing the latitude of
the center of the city.
```
```
lon - a double representing the longitude of
the center of the city.
```
lastLoginTimestamp integer The UTC time of the last login of the user in Unix time

```
format including milliseconds (i.e., the number of seconds
since Jan. 1st 1970 * 1000).
```
lastUpdated string The UTC time when user prole, preferences, or

```
subscriptions data was last updated (either full or partial
```
####  Note

```
Be advised that if a user registers to your site using a
Social Identity, then goes through the Forgot Password
ow, a Site Login is added to their account, however, a
Site Identity is not. A Site Identity can only be created
when accounts.setAccountInfo is called on the user's
account.
```

Field Type Description

```
update) in ISO 8601 format, for example, "2017-07-
16T19:20:30Z".
```
lastUpdatedTimestamp integer The UTC time when the last update of the object occurred

```
(either full or partial update) in Unix time including
milliseconds, based on when the 'lastUpdated', 'Report
AccountsFirstLogin' or 'AccountsReturnedLogin' events are
red.
```
lockedUntil DateTime The earliest time when a user can again log in after they

```
have been locked out by an RBA rule. This property should
always be used instead of the deprecated isLockedOut
property.
```
loginIDs JSON object The user's login identiers. This includes the following

```
elds:
```
```
username - a string representing the username
```
```
emails - an array of strings representing email
addresses
```
```
unveriedEmails - an array of strings representing
email addresses that were not validated
```
```
Note: loginIDs must be specied explicitly in the include
parameter in order to be included in the response.
```
loginProvider string The name of the provider that the user used in order to log

```
in.
```
oldestDataUpdated string The UTC time when the oldest data of the object was

```
refreshed in ISO 8601 format, for example, "1997-07-
16T19:20:30Z".
```
oldestDataUpdatedTimestamp integer The UTC time when the oldest data of the object was

```
refreshed in Unix time format including milliseconds (i.e.,
the number of seconds since Jan. 1st 1970 * 1000).
```
password JSON object The user's Site account password details. Includes the

```
following:
```
```
hash - the hashed password
```
```
hashSettings - object includes:
```
```
algorithm - Represents the hash algorithm
used to encrypt the password.
```
```
rounds - Represents the number of
iterations to perform the hashing.
```
```
salt - Represents the BASE64 encoded
value of the salt.
```
```
format - Represents the template for
merging clear-text passwords. This is only
returned if the pwHashFormat parameter
was set during account import and until the
user's rst login to SAP Customer Data
Cloud (when the user's password is
```

Field Type Description

```
rehashed per the site's settings). See User
Import Guide for additional information.
```
```
created - The last date the user updated/reset their
password in ISO 8601 format, for example, "1997-
07-16T19:20:30Z".
```
```
The created property is always returned,
even if not specifying password in the
include parameter, as long as a password
exists for the account.
```
```
Example object:
```
UIDSignature string This property is deprecated in server to server REST

```
calls! The signature that should be used for login
verication. See User.UID for more information.
```
signatureTimestamp string This property is deprecated in server to server REST

```
calls! The GMT time of the response in UNIX time format,
i.e., the number of seconds since Jan. 1st 1970. The
timestamp should be used for login verication. See
User.UID for more information.
```
phoneNumber string The Phone Number login identier, if the account uses

```
Phone Number Login. The phone number formatting is
e.164. Note that this eld cannot be mapped using the UI
Builder or the Web SDK.
```
preferences Preferences object The user's preferences information as described in the

```
Preferences Object. To have this data returned in the
response, it must be requested using the include
parameter.
```
prole Prole object The user's prole information as described in the object. If

```
the user has more than one type of identity (i.e. site and
social), data from a 'site' source will override data from a
social network and always take precedence. If no site data
exists, the rst social account to update a eld's data takes
precedence. The prole is returned in the response by
default, but if the include parameter is used to specify
other elds that should be provided in the response, the
prole must also be specied explicitly in the include
parameter.
```
```
"password": {
"hash": "R+xxxxxxxxxxxxxxxxxxxxxxxkU=",
"hashSettings": {
"algorithm": "pbkdf2",
"rounds": 3000,
"salt": "zxxxxxxxxxxxxxxxxxxxxxxx="
},
"created": "2020-05-25T11:40:22.353Z"
}
```
####  Tip

```
Identities are merged to create the prole
returned in this API call.
```

Field Type Description

rbaPolicy JSON object The current RBA Policy dened for the specied user.

```
Properties include:
```
```
riskPolicy - Determines the rule set from the
dened rulesSets congured in
accounts.rba.setPolicy or one of the default
policies.
```
```
riskPolicyLocked - Determines whether the user
can change their own riskPolicy. If true, only an
admin can change the user's riskPolicy.
```
registered string The UTC time when the isRegistered parameter was set to

```
true in ISO 8601 format, for example, "1997-07-
16T19:20:30Z".
```
registeredTimestamp string The GMT time when the isRegistered parameter was set to

```
true in Unix time format, including milliseconds.
```
regSource string A string representing the source of the registration. Can be

```
used to set varying destination pages in
accounts.setPolicies.
```
socialProviders string A comma-separated list of the names of the providers to

```
which the user is connected/logged in.
```
subscriptions Subscriptions Object The user's subscription information.

communications Communications Object REST The user's communication topics information.

userInfo User object The SAP Customer Data Cloud User object. This property

```
is deprecated and should not be relied upon.
```
veried string The UTC time when the isVeried parameter was set to

```
true in ISO 8601 format, for example, "1997-07-
16T19:20:30Z".
```
veriedTimestamp string The GMT time when the isVeried parameter was set to

```
true in Unix time format including milliseconds (i.e., the
number of seconds since Jan. 1st 1970 * 1000).
```
internal Object User's internal data.

```
. This section will be returned only by server-side
calls.
```
```
. Internal elds will be returned if the user has
permission to view them. For details on how to set
up Data Field Access in Permission Groups, see
Data Field Access.
```
```
Site Identities have precedence over social
identities.
```
```
Objects are treated like elds they are merged
as one entity, so it’s important to update an
object in full when using the
accounts.setAccountInfo REST or our Screen-
Sets.
```

```
Field Type Description
```
```
customIdentiers JSON Object An object containing the list of custom user IDs belonging
to the user, structured {{Custom identier Name}:
{Custom identier Value}}. This includes the following
elds:
```
```
Custom identier name – the custom identier dened in
the system, for example Loyalty_Number
```
```
User’s custom identier – the specic user’s custom ID.
```
```
For details, see Custom Login Identiers.
```
```
Note: Custom identiers must be explicitly specied in the
include parameter in order to be included in the response.
```
#### Response Example

####  Note

```
A eld that does not contain data will not appear in the response.
```
###### {

```
"UID": "_gid_30A3XVJciH95WE*******7ee3MY+lUAtpVxvUWNseU=",
"UIDSignature": "HHPLo/TC7KobjnGB7JflcWvAXfg=",
"signatureTimestamp": "1412516469",
"loginProvider": "facebook",
"isRegistered": true,
"isActive": true,
"isVerified": true,
"iRank": 57.3400,
"loginIDs": {
"emails": [],
"unverifiedEmails": []
},
"emails": {
"verified": [
"*******@gmail.com"
],
"unverified": []
},
"socialProviders": "facebook,site",
"profile": {
"firstName": "Pinky",
"lastName": "Ray",
"photoURL": "https://graph.facebook.com/v2.0/1020445*******25770/picture?type=large",
"thumbnailURL": "https://graph.facebook.com/v2.0/102*******0325770/picture?type=square",
"birthYear": 1980,
"birthMonth": 4,
"birthDay": 22,
"profileURL": "https://www.facebook.com/app_scoped_user_id/1020*******25770/",
"city": "Athens, Greece",
"gender": "m",
"age": 34,
"email": "*******@gmail.com",
"samlData": {}
},
"identities": [
{
"provider": "facebook",
"providerUID": "10204456750325770",
"isLoginIdentity": true,
"photoURL": "https://graph.facebook.com/v2.0/1020*******5770/picture?type=large",
"thumbnailURL": "https://graph.facebook.com/v2.0/102*******5770/picture?type=square",
"firstName": "Pinky",
"lastName": "Ray",
"gender": "m",
```

"age": "34",
"birthDay": "22",
"birthMonth": "4",
"birthYear": "1980",
"email": "*******@gmail.com",
"city": "Athens, Greece",
"profileURL": "https://www.facebook.com/app_scoped_user_id/1020*******770/",
"proxiedEmail": "",
"allowsLogin": true,
"isExpiredSession": false,
"lastUpdated": "2014-10-05T13:35:14.039Z",
"lastUpdatedTimestamp": 1412516114039,
"oldestDataUpdated": "2014-10-05T13:35:13.421Z",
"oldestDataUpdatedTimestamp": 1412516113421
},
{
"provider": "site",
"providerUID": "_gid_30A3XVJciH*******+lUAtpVxvUWNseU=",
"isLoginIdentity": false,
"allowsLogin": false,
"isExpiredSession": false,
"lastUpdated": "2014-10-05T13:39:53.455Z",
"lastUpdatedTimestamp": 1412516393455,
"oldestDataUpdated": "2014-10-05T13:39:53.455Z",
"oldestDataUpdatedTimestamp": 1412516393455
}
],
"data": {
"hair": "blonde"
},
"communications": {
"marketing_Twitter": {
"topic": "marketing",
"channel": "Twitter",
"status": "OptIn",
"lastModified": "2022-09-05T13:39:53.455Z",
"userActionTimestamp": "2022-09-05T13:39:53.455Z",
}
},
"preferences": {
"terms": {
"tos1": {
"isConsentGranted": true,
"docVersion": 1.0,
"lang": "fr",
"lastConsentModified": "2022-08-23T12:24:41.948Z",
"actionTimestamp": "2022-08-23T12:24:41.948Z",
"tags": [],
"customData": [],
"entitlements": [],
"locales": {
"en": {
"docVersion": 11.
},
"fr": {
"docVersion": 1.
},
"he": {
"docVersion": 1.
}
}
}
}
},
{
"customIdentifiers": {
"Loyalty_number": "my_liyalty_number",
"Frequent_Flyer_Id": "my_frequient_flyer_id"
},
"internal": {"test_read": "done2"},
"password": {},
"created": "2014-09-27T23:47:41.527Z",
"createdTimestamp": 1411861661527,
"lastLogin": "2014-10-05T13:35:13.437Z",


## Additional Information

For additional information regarding Accounts level data objects, see Accounts Objects REST.

## accounts.importFullAccount REST

This method imports user account data into the Accounts Storage.

### Request URL

##### https://accounts.<data-center>/accounts.importFullAccount

Where <data-center> is:

##### us1.gigya.com - For the US data center.

##### eu1.gigya.com - For the European data center.

##### au1.gigya.com - For the Australian data center.

##### eu2.gigya.com - For the European Azure data center.

##### cn1.sapcdm.cn - For the Chinese data center.

##### global.gigya.com - For all Global site groups.

If you are not sure of your site's data center, see Finding Your Data Center.

```
"lastLoginTimestamp": 1412516113437,
"lastUpdated": "2014-10-05T13:39:53.455Z",
"lastUpdatedTimestamp": 1412516393455,
"oldestDataUpdated": "2014-10-05T13:35:13.421Z",
"oldestDataUpdatedTimestamp": 1412516113421,
"registered": "2014-09-27T23:47:41.59Z",
"registeredTimestamp": 1411861661590,
"verified": "2014-09-27T23:47:41.543Z",
"verifiedTimestamp": 1411861661543,
"regSource": "",
"lastLoginLocation": {
"country": "IL",
"coordinates": {
"lat": 31.5,
"lon": 34.
}
},
"rbaPolicy": {
"riskPolicy": "low",
"riskPolicyLocked": false
},
"statusCode": 200,
"errorCode": 0,
"statusReason": "OK",
"callId": "e6f891ac17f24810bee6eb533524a152",
"time": "2015-03-22T11:42:25.943Z"
}
```
####  Note

```
Imported users are not considered new users for reporting purposes.
```

## Parameters

```
Required Name Type Description
```
```
apiKey string The API key of the target site to which the user is
imported.
```
```
uid string A unique identier for the imported user. This UID will
be the main identier for the user in SAP Customer
Data Cloud.
You must either pass a UID in the request or have
createUID set to true. When passing both a UID
and createUID: true, the UID will be used and
createUID will be ignored.
```
```
createUID Boolean You can set this parameter to true to have a UID
automatically generated by the system for the
imported user.
```
```
You must either pass a UID in the request or have
createUID set to true. When passing both a UID
and createUID: true, the UID will be used and
createUID will be ignored.
```
```
importPolicy string How to handle existing users during the import, based
on the UID. Acceptable values:
```
```
insert (default): creates a new user. If the user
exists, an error is returned.
```
```
upsert: modies an existing user or creates a
new one. In "upsert" mode, if a value is passed
to a eld for which data already exists, that
value is overritten and not appended.
```
```
created string The time (in UTC) the account was created in ISO 8601
format, e.g., "2019-07-16T19:20:30Z".
```
```
data JSON Custom data. The purpose of this object is storing any
custom data associated to the user, but which is not
part of the Prole object. Gigya validates that the data
elds meet the requirements that are dened in the
Schema.
```
```
dataCenter string *Early Adopters parameter - supported only with
Global Access*
```
```
The data center in which the registering user's data
will be stored. Acceptable values:
```
```
us
```
```
eu
```
```
au
```
```
cn
```
```
emails JSON Veried and unveried emails. Contains the following
arrays of strings:
```
```
veried
```

Required Name Type Description

```
unveried
```
```
Required for a user to reset password to the account
after import.
```
```
For details regarding the different Email elds in
Customer Data Cloud, see Accounts Objects JS.
```
```
phoneNumber string The phone number login identier, if the account uses
Phone Number Login. The supported phone number
formatting is E.164.
```
```
identities JSON array The user's identities information. Contains all the
properties of the Identity JS object.
```
```
You can expand a full list of all Identity Properties
below the table.
```
```
isActive Boolean Indicates whether the account is active. The default is
true.
```
```
isRegistered Boolean Details if the account is registered or not (if
nalizeRegistration was completed).
```
```
isVeried Boolean Indicates whether the account email(s) is veried.
```
```
lastLogin DateTime The UTC time of the last login of the user in ISO 8601
format, e.g., "2019-07-16T19:20:30Z".
```
```
lastUpdated DateTime The UTC time when the last update of the object
occurred (either full or partial update) in ISO 8601
format, e.g., "2019-07-16T19:20:30Z".
```
```
loginIds array The user's login identiers. Contains the following
properties:
```
```
username - String
```
```
emails - Array of strings
```
```
unveriedEmails - Array of strings
```
```
Required for a user to log in to the account after
import.
```
```
For details regarding the different Email elds in
Customer Data Cloud, see Accounts Objects JS.
```
```
password JSON The user's Site account password details. Contains the
following properties:
```
```
compoundHashedPassword - String - A string
in which a user's password hash as well as the
hashing algorithm and various algorithm
settings are encoded. Such a compound string
packs all information that would otherwise
need to be passed through the HashAlgorithm,
HashSalt and HashRounds parameters. We
currently support two formats, to some extent:
Modular Crypt Format (MCF) strings typically
start with a "$...$" pattern. These strings are
```

Required Name Type Description

```
typically used by PHP and Python-based user
management platforms.
```
```
hashedPassword - String - The user's
password, hashed using the algorithm dened
by the HashAlgorithm parameter using
BASE64 encoding. The max number of hash
bits is 512. If compoundHashedPassword is not
passed, this parameter is required.
```
```
hashSettings - JSON - Password settings
```
```
algorithm - String - The hash algorithm
used to encrypt the password. The
supported hash algorithms are:"md5",
"sha1", "sha1_hashbytes", "sha256",
"sha512", "sha512Hexa",
"md5_double_salted", "md5_crypt",
"bcrypt", "pbkdf2", "pbkdf2_sha256",
"pbkdf2_sha512", "drupal",
"symphony2", and "sap_abap".
```
####  Note

```
You must avoid double encoding with your
hashing. If your hashes are already hex-
encoded, you should convert them to
BASE64-encoding, not perform an
additional BASE64-encoding to the hex-
encoded hashes.
```
####  Note

```
The HashedAlgorithm will
not be accepted if a
compoundHashedPassword
is set. You will typically want
to pass md5-crypt, bcrypt
and drupal password
hashes using their
compoundHashedPassword
representation. You should
specify these algorithms
only if your user
management system stored
the raw form of these
password hashes (as byte
arrays). Be wary of passing
existing base64-encoded
hashes to hashedPassword.
These algorithms typically
string-encode their hashes
using non-standard (MIME)
base64 encodings.
```
```
For the sap_abap password
algorithm, only the
```

Required Name Type Description

```
salt - String - The BASE64 encoded
value of the salt. If HashFormat is
specied and it contains "$salt" ->
HashSalt is a required parameter and
should be clear text, not BASE64-
encoded. The max number of salt bits
is 1024.
```
```
rounds - Integer - Species the
number of iterations to perform the
hashing. The default value is 1, i.e., one
iteration of hashing. If HashAlgorithm
is "bcrypt" then this value must be a
power of two.
```
```
format - String - A template describing
how to merge the clear-text password
that is entered by the user with a salt.
The string must contain "$password",
which will be replaced with the clear-
text password. It may also contain
"$salt", which will be replaced with
whatever value you passed to the
HashSalt parameter (or you can pass
the salt directly in the template and
omit the HashSalt parameter. For
example, Wikipedia hashes passwords
that include a constant salt
("wikipedia") along with a per-user
random salt, as per this template:
"wikipedia$salt$password".
```
```
binaryFormat - String - A template
describing how to merge the clear-text
password that is entered by the user
with an optional salt, and what binary
conversion to perform. This parameter
is similar to HashFormat , but the
difference is that HashFormat works on
top of strings and then implicitly
converts the result into a bytes array
using UTF-8, and HashBinaryFormat ,
on the other hand, uses whatever
encoding is explicitly specied.
```
```
URL - String - The URL to the remote
custom hash algorithm service, used
only if the password hash algorithm is
custom.
```
```
secretQuestionAndAnswer - JSON
```
```
secretQuestion - String - The secret
question that can be used for
verication. This parameter is required
```
```
hashedPassword is
required.
```

Required Name Type Description

```
if specied so in the site's
requireSecurityQuestion Policy.
```
```
secretAnswer - String - The answer to
the secret question. This parameter is
required if specied so in the site's
requireSecurityQuestion Policy.
```
```
preferences JSON The preferences object that contains all the existing
consents for the user.
```
```
prole JSON The user's prole information. The object may include
site's custom elds in addition to reserved eld names
(as dened in the Prole object). Gigya validates that
the prole elds meet the requirements that are
dened in the Schema.
```
```
registered DateTime The UTC time when the isRegistered parameter was
set to true in ISO 8601 format, e.g., "2019-07-
16T19:20:30Z".
```
```
regSource string A string representing the source (URL) of the
registration.
```
```
subscriptions JSON object The user's subscriptions information. The object
includes the user's subscriptions. Gigya validates that
the subscriptions elds meet the requirements that
are dened in the Schema.
```
```
communications JSON object The user's communication information. The object
includes information on the user's communication
topics.
```
```
veried DateTime The UTC time when the isVeried parameter was set
to true in ISO 8601 format, e.g., "2019-07-
16T19:20:30Z".
```
```
lang string The language set for consent, if one is provided.
```
```
providerSessions JSON The user's providerSessions information.
```
```
format string Determines the format of the response.
```
```
json (default)
```
```
context string/JSON This parameter may be used to pass data through the
current method and return it, unchanged, within the
response.
```
```
ignoreInterruptions Boolean This may be used in some cases to suppress logic
applied by the Web SDK, such as automatic opening of
screens (e.g., in a registration completion scenario).
This parameter may not be used with REST APIs.
```
```
httpStatusCodes Boolean The default value of this parameter is false, which
means that the HTTP status code in SAP Customer
Data Cloud's response is always 200 (OK), even if an
error occurs. The error code and message is given
within the response data (see below). If this parameter
```

```
Required Name Type Description
```
```
is set to true, the HTTP status code in SAP Customer
Data Cloud's response would reect an error, if one
occurred.
```
##### Expand for all Identity Properties

```
provider - String
```
```
providerUID - String
```
```
providerUIDSig - String
```
```
mappedProviderUIDs - Array of strings
```
```
allowsLogin - Boolean
```
```
isLoginIdentity - Boolean
```
```
missingPermissions - String
```
```
lastLoginTime - Integer
```
```
isExpiredSession - Boolean
```
```
lastUpdated - DateTime
```
```
lastUpdatedTimestamp - Integer
```
```
oldestDataUpdated - DateTime
```
```
oldestDataUpdatedTimestamp - Integer
```
```
siteIds - Array of strings
```
```
r stName - String
```
```
lastName - String
```
```
nickname - String
```
```
proleURL - String
```
```
address - String
```
```
age - Integer
```
```
bio - String
```
```
birthDay - Integer
```
```
birthMonth - Integer
```
```
birthYear - Integer
```
```
certications - JSON
```
```
city - String
```
```
country - String
```
```
education - JSON
```
```
educationLevel - String
```
```
email - String
```
```
favorites - JSON
```
```
followersCount - Integer
```
```
followingCount - Integer
```
```
gender - String
```
```
hometown - String
```

```
honors - String
```
```
industry - String
```
```
interestedIn - String
```
```
languages - String
```
```
likes - JSON
```
```
locale - String
```
```
name - String
```
```
oidcData - JSON
```
```
patents - JSON
```
```
phones - JSON - Includes:
```
```
number
```
```
type
```
```
photoUrl - String
```
```
politicalView - String
```
```
professionalHeadline - String
```
```
publications - JSON
```
```
relationshipStatus - String
```
```
religion - String
```
```
samlData - JSON
```
```
skills - JSON
```
```
specialties - String
```
```
state - String
```
```
timezone - String
```
```
thumbnailUrl - String
```
```
username - String
```
```
veried - String
```
```
work - JSON
```
```
zip - String
```
## Authorization Parameters

Each REST API request must contain identication and authorization parameters.

Some REST APIs may function without these authorization parameters, however, when that occurs, these calls are treated as

client-side calls and all client-side rate limits will apply. In order to not reach client-side IP rate limits that may impact your

implementation when using server-to-server REST calls, it is Recommended Best Practice to always use an application key and

secret or a bearer token when sending requests. A non-exhaustive list of REST APIs that this may apply to are as follows:

```
accounts.login
```
```
socialize.login
```
```
accounts.notifyLogin
```
```
socialize.notifyLogin
```
```
accounts.nalizeRegistration
```

```
accounts.linkAccounts
```
Please refer to the Authorization Parameters section for details.

## JSON Examples

####  Note

```
As of January 31, 2023, you may no longer use a Partner Secret as a valid authentication method for requests to SAP Customer
Data Cloud servers.
```
###### {

```
"Uid": "11-22-4",
"isRegistered": true,
"isVerified": true,
"password": {
"hashedPassword": "W6ph5Mm5Pz8GgiULbPgzG37mj9g=",
"HashSettings": {
"HashAlgorithm": "sha1"
}
},
"profile": {
"firstName": "Santa",
"lastName": "Claus",
"email": "Jo@mailinator.com",
"city": "North Pole",
"education": [{
"school": "NPU",
"schoolType": "University"
}
],
"publications": [{
"title": "publications title",
"summary": "publications summary"
}
]
},
"data": {
"terms": true
},
"subscriptions": {
"test2sub.email.isSubscribed": false
},
"preferences": {
"test.isConsentGranted": true
},
"lang": "en"
}
```
###### {

```
"Uid": "nrkvf1pe8q2oeknww84n",
"data": {
"terms": true
},
"emails": {
"verified": [
"WillSmith@g.com"
],
"unverified": [
"billiBob@g.com"
]
},
"isActive": true,
"isRegistered": true,
"isVerified": true,
"loginIDs": {
"username": "joBlack",
```

"emails": [
"98mdevz004@gmail.com",
"5gjr3xmju9@gmail.com"
]
},
"password": {
"hashedPassword": "W6ph5Mm5Pz8GgiULbPgzG37mj9g=",
"hashSettings": {
"algorithm": "sha1",
}
},
"profile": {
"firstName": "Santa",
"lastName": "Claus",
"city": "North Pole",
"education": [{
"school": "NPU",
"schoolType": "University"
}
],
"publications": [{
"title": "publications title",
"summary": "publications summary"
}
],
"email": "5gjr3xmju9@gmail.com"
},
"Subscriptions": {
"test2sub.email.isSubscribed": false
},
"lang": "en"
}

###### {

"Uid": "lksjhg5iuasdkjwe45b6",
"data": {
"terms": true
},
"emails": {
"verified": [
"testsigj6uoklcs1jksuj@g.com"
],
"unverified": [
"testsgulyykbszw0ucqiw@g.com"
]
},
"isActive": true,
"isRegistered": true,
"isVerified": true,
"loginIDs": {
"username": "jonDoe",
"emails": [
"testsigj6uoklcs1jksuj@g.com",
"jondoe258@gmail.com"
]
},
"password": {
"hashedPassword": "F6phBoo5Pz8GgiULbPgzG37mj9g=",
"hashSettings": {
"algorithm": "sap_abap",
}
},
"profile": {
"firstName": "Jon",
"lastName": "Doe",
"city": "Peoria",
"education": [{
"school": "University of Illinois Springfield",
"schoolType": "University"
}
],
"publications": [{
"title": "publications title",


## Response Data

```
Field Type Description
```
```
apiVersion integer Denes the API version that returned the response and may not always
be returned.
```
```
callId string Unique identier of the transaction, for debugging purposes.
```
```
errorCode integer The result code of the operation. Code '0' indicates success, any other
number indicates failure. For a complete list of error codes, see the
Error Codes table.
```
```
errorDetails string This eld will appear in the response only in case of an error and will
contain the exception info, if available.
```
```
errorMessage string A short textual description of an error, associated with the errorCode,
for logging purposes. This eld will appear in the response only in case
of an error.
```
```
fullEventName string The full name of the event that triggered the response. This is an
internally used parameter that is not always returned and should not
be relied upon by your implementation.
```
```
time string The time of the response represented in ISO 8601 format: yyyy-mm-
dd-Thh:MM:ss.SSSZ (for example, 2021-03-05T06:11:31.513Z)
```
```
statusCode integer The HTTP response code of the operation. Code '200' indicates
success.
```
```
This property is deprecated and only returned for backward
compatibility.
```
```
statusReason string A brief explanation of the status code.
```
```
This property is deprecated and only returned for backward
compatibility.
```
```
identityConicts JSON Contain the identities that caused a conict. This eld is only returned
if there are conicts, both when returning an error and when returning
success.
```
```
For example:
```
```
"summary": "publications summary"
}
],
"email": "testsigj6uoklcs1jksuj@g.com"
},
"Subscriptions": {
"test2sub.email.isSubscribed": false
},
"lang": "en"
}
```
```
"identityConflicts: [
{ "provider" : "facebook", "providerUID" : "1234" }
]
```
####  Note


## Response Example

## Example for HashBinaryFormat

As explained in the Parameters table, the HashBinaryFormat parameter may contain these tokens:

```
$password:<encoding>
```
```
$salt:<encoding>
```
```
$0x<hex string>
```
The <encoding> can be one of the following: hex, base64, utf8, utf16, or utf32.

Let's assume the following password is hashed: "Gigya<salt>_<password>Gigya", where the surrounding "Gigya" and delimiting

"_" is ASCII-encoded, the <salt> is parsed from base64, and the password is encoded to UTF16.

In this case we need to import a user account using:

Where:

```
$0x4769677961 represents the ASCII bytes for "Gigya" in hex form (refer to an ASCII table).
```
```
$salt:base64 is substituted with the bytes array resulting from base64 decoding the salt, provided during the account
import (which must be a valid base64 string in this case).
```
```
$0x5F represents the delimiting "_".
```
```
$password:utf16 is substituted with the bytes array resulting from encoding the provided text password into UTF-16.
```
## Additional Information

#### Important Notes

Best Practices

```
If you are performing the import with IdentitySync (IDX), use the dedicated component
datasource.write.gigya.importAccount, and not any other component such as write.gigya.generic or record.evaluate,
since the dedicated component better handles requests rate and responses.
```
```
A eld that does not contain data will not appear in the response.
```
###### {

```
"statusCode": 200,
"errorCode": 0,
"statusReason": "OK",
"callId": "3353d2fbac894289977c102298df60d1",
"time": "2015-03-22T11:42:25.943Z",
"identityConflicts": [{
"provider": "facebook",
"providerUID": "1234"
}
]
}
```
```
HashBinaryFormat="$0x4769677961$salt:base64$0x5F$password:utf16$0x4769677961 HashSalt="<base64 str
```

```
Avoid using the same UID for numerous accounts in the same IdentitySync import job: Since calls to Gigya are done in
parallel, the order of the accounts in the import is not guaranteed. Several executions with the same UID may cause data
mismatch and account corruption.
```
```
When importing a large batch, r st test the import with a smaller batch of records. This should expose common data errors
that can be corrected before importing the larger set.
```
```
Each imported le should have about 200K accounts at most, to make it easier to follow and monitor the import progress.
```
```
If data is not provided - it will not be set. An exception for that rule is groups of elds which go together: if data exists in one
of the elds, the whole group will be affected. For example, if a loginID object for an existing account includes a username
(and other loginID elds are empty), and the import of that account includes a loginID email (and other loginID elds are
empty), the existing username will be deleted and the email written.
```
```
When email policies have are active to send any automated emails, e.g. New User Welcome or Email Veric ation, no emails
will be sent to imported user. For more information, see automated email policies.
```
Emphases for IdentitySync Data Flows

```
Import account and reset password:
```
```
In the imported account, make sure a veried email exists so there will be an address to send the email to.
```
```
Copy data between sites:
```
```
IdentitySync has built-in templates for the whole process.
```
```
Search API does not return all of the account data (subscriptions and password will not be returned). To ll the gap -
getAccountInfo can be used (datasource.read.gigya.account).
```
```
Secret questions and answers cannot be copied from site to site.
```
UID Rate Limit

```
The API has a mechanism to block multiple calls with the same UID that happen in a short time period. The allowed rate
limit is no more than 5 calls for the same UID in 1 minute.
```
#### Webhooks

Only the Subscription updated Webhook or Account progressed webhooks may be red when importing a full account. This will

happen only for existing accounts if a subscription is changed or a new subscription recorded or if a lite account was progressed to

a full account. No other webhooks will re when using this API.

#### Federation

Importing of SAML and/or OIDC identities are not supported.

#### Troubleshooting

```
Error Code Message Reason
```
```
400003 Unique identier exists. User already exists.
```
```
400006 Invalid parameter value Invalid parameter value.
```
```
503001 Service unavailable for this operation Too many calls were done with the same
account UID within a specic time period.
```
Properties passed to the API that are not valid or supported property names will be ignored and will not be imported. When an

import succeeds with non-imported properties, a list of the rst few failed properties will be returned in the response.

## accounts.search REST


Searches and retrieves data from SAP Customer Data Cloud's Accounts Storage.

### Description

Searches and retrieves data from SAP Customer Data Cloud's Accounts Storage using an SQL-like query. SQL queries are

converted intoSAP Customer Data Cloud's proprietary query language. SQL injection attacks are not possible because queries are

both created by the customer and then converted by SAP Customer Data Cloud.

Example queries and responses can be viewed at accounts.search examples.

## Query Syntax Specication

The SAP Customer Data Cloud queries use the same syntax rules as SQL, however not all standard SQL key words are available.

```
When querying for string values, value must be wrapped in double quotes. for example, SELECT * FROM accounts WHERE
name = "John Doe".
```
```
When querying for Integer (and other non-textual elds) values, value must not be wrapped in quotes. For example, SELECT
* FROM accounts WHERE age = 42.
```
```
Unsupported SQL syntax in the query string (for example, HAVING) will produce an error.
```
```
The query string clauses must be ordered in the following way*:
```
```
. Select clause
```
```
. From clause
```
```
. Where clause
```
```
. Filter clause
```
```
. Order By clause
```
```
. Start clause Or/And Limit clause
```
```
*Queries ordered differently will produce an error.
```
```
For example:
```
```
SELECT *, prole .birthYear FROM accounts ORDER BY prole .birthYear LIMIT 5 - is a valid query
```
```
SELECT *, prole .birthYear FROM accounts LIMIT 5 ORDER BY prole .birthYear - will produce an error
```
```
Encrypted elds are decrypted during searches but comparison operators (>, >=, <, <=) and regex expressions are not
available on these elds. The Contains keyword can be used for case-insensitive searches on encrypted elds but does not
support partial strings. Usernames, emails, friends' names and friends' emails are encrypted by default, additional elds
may be set as encrypted by the site.
```
```
Deleted accounts do not appear in queries.
```
```
Query examples can be generated and query commands tested using the Identity Query Tool on the SAP Customer Data
Cloud's website: After signing in, go to Reports User Identities Identity Query Tool or click here.
```
select - The "select" statement accepts a comma separated list of elds or objects to retrieve. Acceptable values for this

statement are:

```
Field names, specifying the complete path, i.e. data.album.photo.photoTitle_t, prole .r stName. Specifying partial elds
names (data.album) will return all the elds in the path.
```
####  Caution

```
A short delay is possible between the writing of account data and its availability in queries (an average delay of 1 second, and a
possible maximum of 30 seconds).
```

```
Object names, specifying an object type, i.e., prole r eturns all the elds in the Prole object.
```
```
Partial eld names (elds that contain only a part of the path to sub-objects, i.e., data.album) - will retrieve everything
below that path.
```
```
* - will retrieve every eld in the schema.
```
```
count(*) - if the data source is accounts, returns the number of accounts. If the data source is an object type, returns the
number of objects in the data store. The result is given in the response as a single value inside the "data" eld.
```
```
as - create an alias (temporary title) for the returned object or eld. 'SELECT prole .r stName AS contactName...' will
return a eld inside the prole obj called contactName containing the values of prole .r stName. Example:
```
```
sum(), min(), max(), avg(), sum_of_squares(), variance(), std() - mathematical functions, must all be performed on the
same numeric eld. Fields with null values will be ignored.
```
```
The name of the eld on which the function is to be performed must be entered in the brackets. For example: 'SELECT
min(prole .age) FROM accounts'.
```
```
sum - provides a total for the eld in the brackets.
```
```
min/max - minimum/maximum value for the eld. If no values are found, min returns "innity" and max will return "-
innity".
```
```
avg - average value of the eld.
```
```
variance - the extent that the eld's values vary.
```
```
std - standard deviation, the likelihood that values vary.
```
from - Name of the data source. Only one data source is supported. Account and IDS queries must state "FROM accounts"

(accounts.search or IDS.search). Data will be retrieved from the Prole object and/or the user dened data object in the user

accounts.

where - The "where" clause denes conditions for selecting items from the collection. Supported operators:

```
// Query:
SELECT profile.firstName AS contactName FROM accounts
```
```
// Returns
{
"results": [
{
"profile": {
"contactName": "Eric"
}
},
{
"profile": {
"contactName": "Igor"
}
},
{
"profile": {
"contactName": "Limor"
}
},
... snipped ...
],
"objectsCount": 300,
"totalCount": 1032,
"statusCode": 200,
"errorCode": 0,
"statusReason": "OK",
"callId": "ad24d124f11149729acdb0e7c6a6e590",
"time": "2017-05-04T09:14:35.008Z"
}
```

```
> , >=, <, <= , = , != - the left operand must be a data eld name (with a proper suffix letter) and the right operand must be a
constant of the same type as the eld. For example: "WHERE prole .age >= 18 ".
```
```
Only = and != can be used with encrypted elds.
```
```
*Note: The "=" operand is case sensitive.
```
```
and , or
```
```
contains, not contains - may be used only on text (string) elds and arrays.
```
```
Text (string) elds - supports standard full text search capabilities. Contains is case sensitive, except when used on
encrypted elds. The left operand must be a text eld name and the right operand must be a constant string. You
can search for a specic word within the string, for example: 'WHERE data.about_t CONTAINS "music" '.
Underscores are treated as separators between words.
```
```
If you want to perform a search on an encrypted eld, you must enter the full string. Encrypted elds include the
elds you encrypted and also elds that the SAP Customer Data Cloud encrypts.
```
```
Arrays - the left operand must be an array eld name and the right operand must be a constant of the same type as
the array values. The array eld name must have a suffix denoting the type of the arrays values. For example:
'WHERE data.hobbies_s CONTAINS "swimming" '.
```
```
Note: You can only search words that are part of a sentence, you can't search for parts of a word.
```
```
in() - only retrieve items if the eld contains one of the list values. For example: 'SELECT * FROM accounts WHERE
prole .r stName IN ("Frank", "Dean", "Sammy")' will return users with the specied rst names.
```
```
is null , is not null
```
```
not
```
```
regex ('<regex-pattern>') - denes a search term using regex formatting. The regex syntax can be found in: Regular
Expression Language Reference. Regex patterns can't be used on encrypted elds.
```
order by - The "order by" clause species a list of elds by which to sort the result objects. You can not use ORDER BY on

encrypted elds.

limit - Using the "LIMIT" clause, you may specify the maximum number of returned result objects. If not specied, the default is

300. The maximum number of results that will be returned is 10000 ; setting a limit higher than 10000 will have no affect on

number of results. If the search is sent with openCursor = true, LIMIT will set the batch size. LIMIT must be the last item in the

query.

start - The "start" clause (not an SQL standard clause) may be used for paging. The clause species the start index from which to

return result objects. The maximum start value accepted is 5000.

The 'select - from - where - order by' query creates an (internal) indexed list of objects. By using the start and limit clauses, you will

receive a subset of this list, starting with the start index and ending with start+limit index.

Notes:

```
When implementing paging, there is no guarantee against duplications or that recently added data will show up in the
query results.
```
```
start can't be used with openCursor.
```
#### Query Optimization

Below are a few points to note regarding query optimization:

```
. Query execution is based on clause position and is executed from left to right.
```
```
. Place clauses that have the greatest impact on records returned at the beginning of your SQL statement. For example, to
retrieve a list of male users over the age of 25:
```

```
This is because lt ering rst by gender automatically reduces the result set by half, so the server only needs to run the next
lt er on half of the overall population.
```
```
. A NOT clause (NOT or !) is executed on a single statement immediately to it's right, after analyzing the statement. A single
statement can hold several conditions inside parentheses.
```
```
. Date ranges are calculated much more efficiently using a timestamp eld rather than a date eld.
```
```
. Use of regex is computationally intensive and can signicantly increase response time.
```
```
. AND clauses take precedence over OR clauses (i.e., AND clauses are executed before OR clauses).
```
```
. Use parentheses to modify default precedence (for example, to execute an OR operation before an AND operation).
```
#### Pagination

When running long queries (>5,000 records returned), it's best practice to paginate your results using cursors. If you do not use

cursors, results are limited to a total of 5,000 records per query (not just per page).

To use cursors, during the rst request, pass query=<query to execute> and openCursor=true. The response will include the

nextCursorId eld, containing a cursor ID to be used in the next request. On subsequent requests, pass cursorId=<last response's

nextCursorId> and do not submit the query again. The absence of the nextCursorId eld in a response indicates the end of the

result set.

## Request URL

##### https://accounts.<data-center>/accounts.search

Where <data-center> is:

##### us1.gigya.com - For the US data center.

##### eu1.gigya.com - For the European data center.

##### au1.gigya.com - For the Australian data center.

##### eu2.gigya.com - For the European Azure data center.

##### cn1.sapcdm.cn - For the Chinese data center.

##### global.gigya.com - For all Global site groups.

If you are not sure of your site's data center, see Finding Your Data Center.

Note: Use a POST request rather than GET if you are using a direct REST call.

## Parameters

```
Required Name Type Description
```
```
query string An SQL-like query specifying
the data to retrieve. Refer to the
Query language specication
```
```
SELECT * FROM accounts where profile.gender="m" AND profile.age > 25
```
####  Note

```
When using openCursor, you can't use 'START'.
```

Required Name Type Description

```
section above. When using
cursors, this parameter should
only be sent with the initial
request and omitted from
subsequent requests. *When
using querySig the openCursor
property is not supported.
openCursor is only supported
in server-to-server calls that
include a userKey and secret.
```
The following parameters are Required only when calling the search method from client side (i.e., Mobile SDKs):

```
querySig string An HMAC_SHA1 signature
proving that the search call is in
fact coming from your client
application, in order to prevent
fraud. Follow the instructions in
Constructing a Signature using
the following base-string: query
+ "_" + expTime.
```
```
expTime string The GMT time when the
signature, provided in the
UIDSig parameter, should
expire. The expected format is
the Unix time format including
milliseconds (i.e., the number of
seconds since Jan. 1st 1970 *
1000). SAP Customer Data
Cloud checks the time when the
search request is received. If the
time succeeds expTime, the
request is considered forged.
```
```
openCursor Boolean When set to true, the search
response will include, in
addition to the rst page,
another eld named
nextCursorId, which is used to
fetch the next batch of results.
This parameter should only be
used on the rst request and
later should be removed from
the request. When openCursor
is active, the Limit clause sets
the number of results returned
in the batch and should not be
larger than 1000 (one
thousand).
```
```
Notes:
```
```
When using a cursor
with a Limit set, the
number of results in a
batch is not guaranteed.
```

Required Name Type Description

```
openCursor is not
supported when using
querySig and can only
be used in server-to-
server calls that include
a userKey and secret.
```
```
cursorId string The cursor ID that contains the
nextCursorId value received in
the rst search call.
```
```
Notes:
```
```
You can't pass both
cursorId and query on
the same request -
cursorId brings the next
page for the search for
which it was opened.
Also, the time between
search requests using a
cursorId must not
exceed 5 minutes (300
seconds).
```
```
Each request should
contain a different
cursorId obtained from
the response of the
previous request (not
the rst) using the
nextCursorId eld. The
exception to this rule is
when a request fails or
when a particular result
set needs to be resent;
in this case, resend the
same cursorID (as long
as it has not expired) to
receive its associated
result set.
```
```
timeout integer The timeout for the request (in
milliseconds). Default value is
20000 (20 seconds). Maximum
allowed value is 60000 (60
seconds).
```

Required Name Type Description

```
restrictedQuery string An SQL-like query specifying
the data to retrieve. When using
this parameter, the query
specied must meet the regex
criteria dened for the user
making this call.
When using restrictedQuery, an
ACL must exist with a regex
limiting the allowValues for this
parameter.
```
```
accountTypes string The type of account to retrieve:
full or lite. Acceptable values:
```
```
full (the default value)
```
```
lite
```
```
full,lite
```
```
format string Determines the format of the
response.
```
```
json (default)
```
```
context string/JSON This parameter may be used to
pass data through the current
method and return it,
unchanged, within the
response.
```
```
ignoreInterruptions Boolean This may be used in some cases
to suppress logic applied by the
Web SDK, such as automatic
opening of screens (for
example, in a registration
completion scenario). This
parameter may not be used
with REST APIs.
```
```
httpStatusCodes Boolean The default value of this
parameter is false, which means
that the HTTP status code in
SAP Customer Data Cloud's
response is always 200 (OK),
even if an error occurs. The
error code and message is given
within the response data (see
below). If this parameter is set
to true, the HTTP status code in
SAP Customer Data Cloud's
response would reect an error,
if one occurred.
```
####  Note


## Authorization Parameters

Each REST API request must contain identication and authorization parameters.

Some REST APIs may function without these authorization parameters, however, when that occurs, these calls are treated as

client-side calls and all client-side rate limits will apply. In order to not reach client-side IP rate limits that may impact your

implementation when using server-to-server REST calls, it is Recommended Best Practice to always use an application key and

secret or a bearer token when sending requests. A non-exhaustive list of REST APIs that this may apply to are as follows:

```
accounts.login
```
```
socialize.login
```
```
accounts.notifyLogin
```
```
socialize.notifyLogin
```
```
accounts.nalizeRegistration
```
```
accounts.linkAccounts
```
Please refer to the Authorization Parameters section for details.

## Sample Requests

##### .NET

```
Internal elds, are returned only in the accounts.search and the accounts.getAccountInfo REST API calls, with the proper
parameters.
```
####  Note

```
As of January 31, 2023, you may no longer use a Partner Secret as a valid authentication method for requests to SAP Customer
Data Cloud servers.
```
```
using System;
using Gigya.Socialize.SDK;
```
```
class Program {
static void Main(string[] args)
{
const string apiKey = "Enter-Your-API-Key-Here";
const string secretKey = "Enter-Your-Secret-Key-Here";
```
```
string method = "accounts.search";
GSRequest request = new GSRequest(apiKey, secretKey, method, true);
```
```
request.SetParam("query","SELECT * FROM accounts WHERE profile.gender='m' AND profile.a
```
```
GSResponse response = request.Send();
```
```
if (response.GetErrorCode() == 0)
{
// Everything's okay
GSObject resObj = response.GetData();
```
```
// Do something with the data
}
else
{
Console.WriteLine("Uh-oh, we got the following error:{0}", response.GetLog());
}
```

##### cURL

##### Java

##### PHP

###### }

###### }

```
# Define the API and Secret key (the keys can be obtained from your site setup page in the Gigya co
# Enter the proper Data center (us1, eu1, au1) if not using us1.
# Requests include a secret and MUST be sent over SSL.
```
```
# You can copy and import the code below directly into Postman.
```
```
curl -X POST \
https://accounts.gigya.com/accounts.search \
-H 'content-type: application/x-www-form-urlencoded' \
--data-urlencode "apiKey=[Enter-Your-API-Key-Here]" \
--data-urlencode "secret=[Enter-Your-Secret-Key]" \
--data-urlencode "query=SELECT * FROM accounts WHERE profile.gender='m' AND profile.age > 25" \
```
```
class Program {
```
```
public static void main(String[] args) {
```
```
//Define the API-Key and Secret key (the keys can be obtained from your site setup page on Gigy
final String apiKey = "PUT-YOUR-APIKEY-HERE";
final String secretKey = "PUT-YOUR-SECRET-KEY-HERE";
```
```
String apiMethod = "accounts.search";
GSRequest request = new GSRequest(apiKey, secretKey, apiMethod);
```
```
request.setParam("query","SELECT * FROM accounts WHERE profile.gender='m' AND profile.age > 25"
```
```
GSResponse response = request.send();
```
```
if(response.getErrorCode()==0)
{
System.out.printIn("success!");
}
else
{
System.out.printIn("Uh-oh, we got the following error: " + response.getLog());
}
```
```
}
}
```
```
<?php
```
```
include_once("/path/to/GSSDK.php");
```
```
$apiKey = "PUT-YOUR-APIKEY-HERE";
$secretKey = "PUT-YOUR-SECRET-KEY-HERE";
```
```
$method = "accounts.search";
```
```
$request = new GSRequest($apiKey,$secretKey,$method);
$request->setParam("query","SELECT * FROM accounts WHERE profile.gender='m' AND profile.age > 25");
```
```
$response = $request->send();
```
```
if($response->getErrorCode()==0)
{
echo "Success";
```

##### Python

#### Search from accounts

##### Response Data

```
Field Type Description
```
```
apiVersion integer Denes the API version that returned the
response and may not always be returned.
```
```
callId string Unique identier of the transaction, for
debugging purposes.
```
```
errorCode integer The result code of the operation. Code '0'
indicates success, any other number
indicates failure. For a complete list of error
codes, see the Error Codes table.
```
```
errorDetails string This eld will appear in the response only in
case of an error and will contain the
exception info, if available.
```
```
errorMessage string A short textual description of an error,
associated with the errorCode, for logging
purposes. This eld will appear in the
response only in case of an error.
```
```
fullEventName string The full name of the event that triggered
the response. This is an internally used
parameter that is not always returned and
```
###### }

```
else
{
echo ("Uh-oh, we got the following error: ". $response->getErrorMessage());
error_log($response->getLog());
}
```
```
?>
```
```
from GSSDK import *
```
```
# Define the API and Secret key (the keys can be obtained from your site setup page in the Gigya co
apiKey = "PUT-YOUR-APIKEY-HERE"
secretKey = "PUT-YOUR-SECRET-KEY-HERE"
```
```
# Step 1 - Defining the request and adding parameters
method = "accounts.search"
params = {
"query":"SELECT * FROM accounts WHERE profile.gender='m' AND profile.age > 25"
}
request = new GSRequest(apiKey,secretKey,method,params)
```
```
# Step 2 - Sending the request
response = request.send()
```
```
# Step 3 - handling the request's response.
if (response.getErrorCode()==0):
# SUCCESS! response status = OK
print "Success in accounts.search operation."
else:
# Error
print "Got error on accounts.search: " + response.getErrorMessage()
# You may also log the response: response.getLog()
```

```
Field Type Description
```
```
should not be relied upon by your
implementation.
```
```
time string The time of the response represented in
ISO 8601 format: yyyy-mm-dd-
Thh:MM:ss.SSSZ (for example, 2021-03-
05T06:11:31.513Z)
```
```
statusCode integer The HTTP response code of the operation.
Code '200' indicates success.
```
```
This property is deprecated and only
returned for backward compatibility.
```
```
statusReason string A brief explanation of the status code.
```
```
This property is deprecated and only
returned for backward compatibility.
```
```
results Array An array of Account objects (full or partial
objects, based on your selected clause),
retrieved from SAP Customer Data Cloud's
Accounts Storage.
```
```
nextCursorId string Used to fetch the next batch of results. This
parameter is not returned on the last batch
of results, its absence means that the result
set is nished.
```
```
objectsCount integer The number of objects returned in the
"results" array.
```
```
totalCount integer The total number of objects that satisfy the
query in the DB. This is useful when
fetching a limited amount using the "limit"
parameter.
```
##### Account Object

```
Field Type Description
```
```
UID string The unique user ID. This user ID should be used for login
verication. See User.UID for more information.
```
```
created string The UTC time the account was created in ISO 8601 format,
for example, "1997-07-16T19:20:30Z".
```
```
createdTimestamp integer The UTC time the account was created in Unix time format
including milliseconds (i.e., the number of seconds since
Jan. 1st 1970 * 1000).
```
```
customIdentiers sting The unique custom user ID. This custom user identier
should be used for login verication. For details, see
Custom Login Identiers.
```
####  Note

```
Search from the Accounts object does not return subscriptions. For subscriptions, search under emailAccounts below.
```

Field Type Description

data JSON object Custom data. Any data that you want to store regarding the

```
user that isn't part of the Prole object.
```
emails JSON object The email addresses belonging to the user. This includes

```
the following elds:
```
```
veried - an array of strings representing the user's
veried email addresses
```
```
unveried - an array of strings representing the
user's unveried email addresses.
```
```
Note: emails must be specied explicitly in the include
parameter in order to be included in the response.
```
groups JSON object When using CIAM for B2B, this is where the user's
Organization Management data is stored. For a detailed
Description of this eld, see the Groups object
documentation.

identities array An array of Identity Objects, each object represents a

```
user's social identity. Each Identity Object contains
imported data from a social network that the user has
connected to.
```
```
Note: You must explicitly specify identities within the
include parameter for them to be included in the response:
identities-active , identities-all, or identities-global to
return only active identities, all identities of a site, or all
identities of a site group, respectively.
```
iRank integer Inuencer rank of the user. This property is deprecated

```
and will always return 0.
```
isActive Boolean Indicates whether the account is active. The account is

```
active once the user creates it even without nalizing it.
The account can be deactivated, but it will still be
registered if the registration process has been nalized. If
isActive==false the user can't log in, however any currently
active sessions remain valid.
```
isLockedOut Boolean This property is deprecated' use lockedUntil via

```
accounts.search instead.
```
isRegistered Boolean Indicates whether the user is registered. The user is

```
registered once his registration has been nalized.
```
isVeried Boolean Indicates whether the account email is veried.

####  Note

```
Be advised that if a user registers to your site using a
Social Identity, then goes through the Forgot Password
ow, a Site Login is added to their account, however, a
Site Identity is not. A Site Identity can only be created
when accounts.setAccountInfo is called on the user's
account.
```

Field Type Description

lastLogin string The time of the last login of the user in ISO 8601 format, for

```
example, "1997-07-16T19:20:30Z".
```
lastLoginLocation JSON object The user's last login location, derived from IP address. This

```
includes the following elds:
```
```
country - a string representing the two-character
country code.
```
```
state - a string representing the state, where
available.
```
```
city - a string representing the city name.
```
```
coordinates - an object containing:
```
```
lat - a double representing the latitude of
the center of the city.
```
```
lon - a double representing the longitude of
the center of the city.
```
lastLoginTimestamp integer The UTC time of the last login of the user in Unix time

```
format including milliseconds (i.e., the number of seconds
since Jan. 1st 1970 * 1000).
```
lastUpdated string The UTC time when user prole, preferences, or

```
subscriptions data was last updated (either full or partial
update) in ISO 8601 format, for example, "2017-07-
16T19:20:30Z".
```
lastUpdatedTimestamp integer The UTC time when the last update of the object occurred

```
(either full or partial update) in Unix time including
milliseconds, based on when the 'lastUpdated', 'Report
AccountsFirstLogin' or 'AccountsReturnedLogin' events are
red.
```
lockedUntil DateTime The earliest time when a user can again log in after they

```
have been locked out by an RBA rule. This property is only
available when using accounts.search
```
loginIDs JSON object The user's login identiers. This includes the following

```
elds:
```
```
username - a string representing the username
```
```
emails - an array of strings representing email
addresses
```
```
unveriedEmails - an array of strings representing
email addresses that were not validated
```
```
Note: loginIDs must be specied explicitly in the include
parameter in order to be included in the response.
```
loginProvider string The name of the provider that the user used in order to

```
login.
```

Field Type Description

oldestDataUpdated string The UTC time when the oldest data of the object was

```
refreshed in ISO 8601 format, for example, "1997-07-
16T19:20:30Z".
```
oldestDataUpdatedTimestamp integer The UTC time when the oldest data of the object was

```
refreshed in Unix time format including milliseconds (i.e.,
the number of seconds since Jan. 1st 1970 * 1000).
```
password JSON object The user's Site account password details. Includes the

```
following:
```
```
hash - the hashed password
```
```
hashSettings - object includes:
```
```
algorithm - Represents the hash algorithm
used to encrypt the password.
```
```
rounds - Represents the number of
iterations to perform the hashing.
```
```
salt - Represents the BASE64 encoded
value of the salt.
```
```
format - Represents the template for
merging clear-text passwords. This is only
returned if the pwHashFormat parameter
was set during account import and until the
user's rst login to SAP Customer Data
Cloud (when the user's password is
rehashed per the site's settings). See User
Import Guide for additional information.
```
```
created - The last date the user updated/reset their
password in ISO 8601 format, for example, "1997-
07-16T19:20:30Z".
```
```
Example Object:
```
UIDSignature string This property is deprecated in server to server REST

```
calls! The signature that should be used for login
verication. See User.UID for more information.
```
signatureTimestamp string This property is deprecated in server to server REST

```
calls! The GMT time of the response in UNIX time format,
i.e., the number of seconds since Jan. 1st 1970. The
timestamp should be used for login verication. See
User.UID for more information.
```
```
"password": {
"hash": "R+xxxxxxxxxxxxxxxxxxxxxxxkU=",
"hashSettings": {
"algorithm": "pbkdf2",
"rounds": 3000,
"salt": "zxxxxxxxxxxxxxxxxxxxxxxx="
},
"created": "2020-05-25T11:40:22.353Z"
}
```

Field Type Description

phoneNumber string The Phone Number login identier, if the account uses

```
Phone Number Login. The phone number formatting is
e.164. Note that this eld can't be mapped using the UI
Builder or the Web SDK.
```
preferences Preferences object The user's preferences information as described in the

```
Preferences Object. To have this data returned in the
response, it must be specically requested using the
include parameter.
```
prole Prole object The user's prole information as described in the object. If

```
the user has more than one type of identity (i.e. site and
social), data from a 'site' source will override data from a
social network and always take precedence. If no site data
exists, the rst social account to update a eld's data will
take precedence. The prole is returned in the response by
default, but if the include parameter is used to specify
other elds that should be provided in the response, the
prole must also be specied explicitly in the include
parameter.
```
rbaPolicy JSON object The current RBA Policy dened for the specied user.

```
Properties include:
```
```
riskPolicy - Determines the rule set from the
dened rulesSets congured in
accounts.rba.setPolicy or one of the default
policies.
```
```
riskPolicyLocked - Determines whether the user
can change their own riskPolicy. If true, only an
admin can change the user's riskPolicy.
```
registered string The UTC time when the isRegistered parameter was set to

```
true in ISO 8601 format, for example, "1997-07-
16T19:20:30Z".
```
registeredTimestamp string The GMT time when the isRegistered parameter was set to

```
true in Unix time format, including milliseconds.
```
regSource string A string representing the source of the registration. Can be

```
used to set varying destination pages in
accounts.setPolicies.
```
socialProviders string A comma-separated list of the names of the providers to

```
which the user is connected/logged in.
```
userInfo User object The SAP Customer Data Cloud User object. This property

```
is deprecated and should not be relied upon.
```
veried string The UTC time when the isVeried parameter was set to

```
true in ISO 8601 format, for example, "1997-07-
16T19:20:30Z".
```
veriedTimestamp string The GMT time when the isVeried parameter was set to

```
true in Unix time format including milliseconds (i.e., the
number of seconds since Jan. 1st 1970 * 1000).
```

##### Response Example

####  Note

```
A eld that does not contain data will not appear in the response.
```
###### {

```
"statusCode": 200,
"errorCode": 0,
"statusReason": "OK",
"callId": "31ba039fb8d340ceb2f43d52c89bf187",
"time": "2015-03-22T11:42:25.943Z",
"results": [{
"UID": "17490",
"isRegistered": true,
"registeredTimestamp": 1344525120445,
"registered": "2012-08-09T15:12:00.445Z",
"isActive": true,
"isVerified": false,
"iRank": 0,
"loginIDs": {
"username": "h17490@gmail.com",
"emails": [],
"unverifiedEmails": []
},
"emails": {
"verified": [],
"unverified": ["h17490@gmail.com"]
},
"socialProviders": "site",
"profile": {
"email": "rastropovich17490@gmail.com",
"firstName": "Joe",
"lastName": "Smith",
"age" : "31",
"gender" : "m",
"country" : "US"
},
"identities": [{
"provider": "site",
"providerUID": "17490",
"isLoginIdentity": false,
"gender": "",
"email": "h17490@gmail.com",
"allowsLogin": false,
"isExpiredSession": false,
"lastUpdated": "2012-08-09T15:12:00.302Z",
"lastUpdatedTimestamp": 1344525120302,
"oldestDataUpdated": "2012-08-09T15:12:00.302Z",
"oldestDataUpdatedTimestamp": 1344525120302}],
"data": {},
"created": "2012-08-09T15:12:00.297Z",
"createdTimestamp": 1344525120297,
"lastLogin": "0001-01-01T00:00:00Z",
"lastLoginTimestamp": 0,
"lastUpdated": "2012-08-09T15:12:00.302Z",
"lastUpdatedTimestamp": 1344525120302,
"oldestDataUpdated": "2012-08-09T15:12:00.302Z",
"oldestDataUpdatedTimestamp": 1344525120302},
{
"UID": "10067",
"isRegistered": true,
"isActive": true,
"isVerified": false,
"iRank": 0,
"loginIDs": {
"username": "vich@gmail.com",
"emails": [],
"unverifiedEmails": []
},
"emails": {
"verified": [],
```

#### Search from emailAccounts

##### Response Data

```
Field Type Description
```
```
results Array An array of Account objects (Account REST,
full or partial objects, based on your
selected clause), retrieved from SAP
Customer Data Cloud's Accounts Storage.
```
```
nextCursorId string Used to fetch the next batch of results. This
parameter is not returned on the last batch
of results, its absence means that the result
set is nished.
```
```
"unverified": ["vich@gmail.com"]
},
"socialProviders": "site",
"profile": {
"email": "vich10067@gmail.com",
"firstName": "David",
"lastName": "Cohen",
"age" : "50",
"gender" : "m",
"country" : "Canada"
},
"identities": [{
"provider": "site",
"providerUID": "10067",
"isLoginIdentity": false,
"gender": "",
"email": "vich@gmail.com",
"allowsLogin": false,
"isExpiredSession": false,
"lastUpdated": "2012-08-09T15:02:56.969Z",
"lastUpdatedTimestamp": 1344524576969,
"oldestDataUpdated": "2012-08-09T15:02:56.969Z",
"oldestDataUpdatedTimestamp": 1344524576969}],
"data": {},
"password": {
"hash": "YG8PL6PwxlH0+KbUb4vG3w==",
"hashSettings": {
"algorithm": "pbkdf2",
"rounds": 5000,
"salt": "iIj9T09VwfcvLv/0D7rFkA=="
}
},
{
"UID": "4c6d4614e8cd478f80e30fcc657db6ac",
"dataCenter": "eu1",
"customIdentifiers":
{
"Frequent_Flyer_ID": "my_ff_id"
}
},
"tfaStatus": "forceOff",
"created": "2012-08-09T15:02:56.961Z",
"createdTimestamp": 1344524576961,
"lastLogin": "0001-01-01T00:00:00Z",
"lastLoginTimestamp": 0,
"lastUpdated": "2012-08-09T15:02:56.969Z",
"lastUpdatedTimestamp": 1344524576969,
"oldestDataUpdated": "2012-08-09T15:02:56.969Z",
"oldestDataUpdatedTimestamp": 1344524576969
},
...
]
}
```

Field Type Description

objectsCount integer The number of objects returned in the

```
"results" array.
```
totalCount integer The total number of objects that satisfy the

```
query in the DB. This is useful when
fetching a limited amount using the " limit "
parameter.
```
subscriptions JSON object Contains any subscription data associated

```
with this emailAccount. For more
information, search for Subscriptions
Object REST.
```
email string The email address for this account.

created string The time the account was created in ISO

```
8601 format, for example, "2017-06-
06T14:34:44.102Z".
```
token string A unique token belonging to this account,

```
similar to a UID, however, lite accounts do
not have UIDs.
```
lastUpdatedTimestamp integer The UNIX timestamp the account was last

```
updated, with milliseconds.
```
hasFullAccount Boolean Whether or not this email address is

```
associated with a full registered account.
```
data JSON object Contains any dataSchema members that

```
pertain to this account.
```
lastUpdated string The time the account was last updated in

```
ISO 8601 format, for example, " 2017-06-
06T14:34:44.102Z ".
```
hasLiteAccount Boolean Whether or not this email address is

```
associated with a lite account.
```
channel string The type of lite account this emailAccount

```
belongs to. Possible values are:
```
```
email
```
prole JSON object Contains any proleSchema members that

```
pertain to this account.
```
missing integer

createdTimestamp integer The UNIX timestamp the account was

```
created, with milliseconds.
```
apiVersion integer Denes the API version that returned the

```
response and may not always be returned.
```
callId string Unique identier of the transaction, for

```
debugging purposes.
```
errorCode integer The result code of the operation. Code '0'

```
indicates success. Any other number
```

```
Field Type Description
```
```
indicates failure. For a complete list of error
codes, search for the Response Codes
and Errors REST table.
```
```
errorDetails string This eld will appear in the response only in
case of an error and will contain the
exception info, if available.
```
```
errorMessage string A short textual description of an error,
associated with the errorCode, for logging
purposes. This eld will appear in the
response only in case of an error.
```
```
fullEventName string The full name of the event that triggered
the response. This is an internally used
parameter that is not always returned and
should not be relied upon by your
implementation.
```
```
time string The time of the response represented in
ISO 8601 format: yyyy-mm-dd-
Thh:MM:ss.SSSZ (for example, 2021-03-
05T06:11:31.513Z)
```
```
statusCode integer The HTTP response code of the operation.
Code '200' indicates success.
```
```
This property is deprecated and only
returned for backward compatibility. (REST
API Deprecated Response Fields)
```
```
statusReason string A brief explanation of the status code.
```
```
This property is deprecated and only
returned for backward compatibility. (REST
API Deprecated Response Fields)
```
##### Searching emailAccounts

Construct your search similar to a regular accounts search, but use emailAccounts, an example follows:

Which will return a response similar to the following:

####  Note

```
A eld that does not contain data will not appear in the response.
```
```
SELECT * FROM emailAccounts WHERE profile.email = '34@34.com'
```
###### {

```
"results": [
{
"createdTimestamp": 1496584985099,
"subscriptions": {
"jun4th.a001": {
"email": {
"tags": [
"oneTag",
```

#### Search from Communications

##### Response Data

```
Field Type Description
```
```
apiVersion integer Denes the API version that returned the
response and may not always be returned.
```
```
callId string Unique identier of the transaction, for
debugging purposes.
```
```
errorCode integer The result code of the operation. Code '0'
indicates success. Any other number
indicates failure. For a complete list of error
codes, search for the Response Codes
and Errors REST table.
```
```
errorDetails string This eld will appear in the response only in
case of an error and will contain the
exception info, if available.
```
```
errorMessage string A short textual description of an error,
associated with the errorCode, for logging
purposes. This eld will appear in the
response only in case of an error.
```
```
time string The time of the response represented in
ISO 8601 format: yyyy-mm-dd-
Thh:MM:ss.SSSZ (for example, 2021-03-
05T06:11:31.513Z)
```
```
"twoTag"
],
"lastUpdated": "2017-06-04T14:03:05.100Z",
"isSubscribed": true
}
}
},
"email": "34@34.com",
"created": "2017-06-04T14:03:05.099Z",
"token": "c69f5baf20daaee31d77db679a109b3ffc93a37884ec4fd6bef7ba8dcdb2122c",
"hasFullAccount": true,
"lastUpdatedTimestamp": 1496588214577,
"data": {
"subscribe": false,
"terms": false
},
"lastUpdated": "2017-06-04T14:56:54.577Z",
"hasLiteAccount": true,
"channel": "email",
"profile": {
"email": "34@34.com",
"locale": "en"
}
}
],
"objectsCount": 1,
"totalCount": 1,
"missing": 0,
"statusCode": 200,
"errorCode": 0,
"statusReason": "OK",
"callId": "58fb7c5cfdb9426b8dcd04bef9eed898",
"time": "2017-06-06T12:12:57.675Z"
}
```

```
Field Type Description
```
```
statusCode integer The HTTP response code of the operation.
Code '200' indicates success.
```
```
This property is deprecated and only
returned for backward compatibility. (REST
API Deprecated Response Fields)
```
```
statusReason string A brief explanation of the status code.
```
```
This property is deprecated and only
returned for backward compatibility. (REST
API Deprecated Response Fields)
```
```
results Array An array of Account objects (Account REST,
full or partial objects, based on your
selected clause), retrieved from SAP
Customer Data Cloud.
```
```
topicId string The name of the communication topic.
```
```
channelId string The type of communication channel by
which this communication topic is delivered
to the user. Possible values are:
```
```
SMS
```
```
timestamp string The time of the last update of this
communication topic, represented in ISO
8601 format: yyyy-mm-dd-Thh:MM:ss.SSSZ
(for example, 2021-03-05T06:11:31.513Z)
```
```
status string The status of this communication topic on
this user's account:
Possible values are:
```
```
OptIn
```
```
OptOut
```
```
UID string The UID of the user's account.
```
##### Searching communications

Construct your search similar to a regular accounts search, but use communications, an example follows:

Which will return a response similar to the following:

####  Note

```
A eld that does not contain data will not appear in the response.
```
```
SELECT * FROM communications WHERE topicId="newsletter" and channellId="SMS"
```
###### {

```
"callId": "e10cb4c032dc4107aa6dec470ffaffa4",
"errorCode": 0,
"apiVersion": 2,
"statusCode": 200,
```

To retrieve the UID of newly created accounts that are not yet available via accounts.search due to caching issues, you can use the

UID returned from accounts.identiers.nd REST and call accounts.getAccountInfo REST.

## accounts.search examples REST

```
. Example of a count of accounts:
```
```
. Example of a query using limit and start. The query lists 3 account elds for users in the USA where the user is 18 years old
or more. The query will return 5 results, starting with the 100th valid user.
```
```
Response to the query:
```
```
. An illustration of the as keyword, in which elds are renamed in the results.
```
```
Response to the query:
```
```
"statusReason": "OK",
"time": "2022-07-05T06:20:19.181Z",
"results": [
{
"topicId": "newsletter",
"channelId": "SMS",
"timestamp": "2022-05-09T12:41:03.551Z",
"status": "OptIn",
"UID": "23ecf38fc7ae4a1ca5f48a49449e98e4"
},
{
"topicId": "newsletter",
"channelId": "SMS",
"timestamp": "2022-05-09T10:24:48.327Z",
"status": "OptIn",
"UID": "2205f823fcb84558be149ffd07c86f36"
}
]
}
```
```
SELECT count(*) FROM accounts
Response to the query:
{"results": [{ "count(*)": 1527}],
"objectsCount": 1,
"totalCount": 1527,
"statusCode": 200,
"errorCode": 0,
"statusReason": "OK",
"callId": "1234"}
```
```
SELECT profile.firstName, profile.lastName, profile.email FROM accounts WHERE profile.country
```
```
{"results": [
{"profile": {"email": "g1@gmail.com"} },
{"profile": {"firstName": "George", "lastName": "Lucas", "email": "g2@gmail.com" } },
{"profile": {"firstName": "Paris", "lastName": "Radisson" } },
{"profile": {"firstName": "Barry", "lastName": "Ray", "email": "g4@gmail.com" } },
{"profile": {"firstName": "Tina", "lastName": "Tuna", "email": "g5@gmail.com" } } ],
"objectsCount": 5,
"totalCount": 1840,
"statusCode": 200,
"errorCode": 0,
"statusReason": "OK",
"callId": "123456" }
```
```
SELECT profile.firstName AS xName, profile.lastName AS xSurname, profile.email AS xemail FROM
```
```
{ "results": [
{"profile": {"xName": "Ray", "xSurname": "Ban", "xemail": "t1@gmail.com" } },
{"profile": {"xName": "Tom", "xSurname": "Ray", "xemail": "t2@gmail.com" } },
```

```
Response to the query:
```
. Example of a query using contains. This query counts the accounts who have issued a like for a topic whose name contains
the word "Madrid":

```
Response to the query
```
. Example of a query using regex. This query searches for religions starting with the letter "A".

```
Response to the query:
```
. Example of a query using counters. This query returns a list of counters for the account.

```
Response to the query:
```
```
{"profile": {"xName": "Jim", "xSurname": "Man", "xemail": "t3@yahoo.com" } },
{"profile": {"xName": "Jane", "xSurname": "Big", "xemail": "t4@gmail.com" } },
{"profile": {"xName": "Jan", "xSurname": "Tzorken","xemail": "t5@gigya-inc.com" } }
],
"objectsCount": 5,
"totalCount": 25,
"statusCode": 200,
"errorCode": 0,
"statusReason": "OK",
"callId": "12345" }
```
```
{ "results": [
{"profile": {"xName": "Ray", "xSurname": "Ban", "xemail": "t1@gmail.com" } },
{"profile": {"xName": "Tom", "xSurname": "Ray", "xemail": "t2@gmail.com" } },
{"profile": {"xName": "Jim", "xSurname": "Man", "xemail": "t3@yahoo.com" } },
{"profile": {"xName": "Jane", "xSurname": "Big", "xemail": "t4@gmail.com" } },
{"profile": {"xName": "Jan", "xSurname": "Tzorken","xemail": "t5@gigya-inc.com" } }
],
"objectsCount": 5,
"totalCount": 25,
"statusCode": 200,
"errorCode": 0,
"statusReason": "OK",
"callId": "12345" }
```
```
SELECT count(*) FROM accounts WHERE profile.likes.name CONTAINS "Madrid"
```
###### {

```
"results":
[ { "count(*)": 28 } ],
"objectsCount": 1,
"totalCount": 28,
"statusCode": 200,
"errorCode": 0,
"statusReason": "OK",
"callId": "1234567"
}
```
```
SELECT profile.name, profile.industry, profile.religion FROM accounts WHERE profile.religion
```
```
{ "results": [
{ "profile": { "name": "Roger Dodge", "religion": "Atea", "industry": "Computer Software" } }
{ "profile": { "name": "Andy Goslan", "religion": "Atea", "industry": "Computer Software" } }
"objectsCount": 2,
"totalCount": 2,
"statusCode": 200,
"errorCode": 0,
"statusReason": "OK",
"callId": "1234567"
}
```
```
SELECT counters FROM accounts WITH counters
```

## accounts.search RegEx support REST

## Querying using Regular Expressions

Gigya supports searching using regular expressions. Note that RegEx search cannot be applied to encrypted elds. For a full list of

elds that are encrypted by default, see Encrypted Fields; in addition, elds may be encrypted by your site admin using the

schema editor.

## Description

The supported operations for searching using regular expressions are listed below.

When possible, you should try to use a long prex before your regular expression, as wide matching expressions (such as .*?+)

may be computationally intensive.

#### Anchoring

Patterns are always anchored. The pattern provided must match the entire string.

For string "abcde":

ab.* # match

abcd # no match

#### Reserved Characters

The following characters are reserved, and need to be escaped:

###### ?. + * | { } [ ] ( ) " \

Any reserved character can be escaped with a backslash.

For example: "\*", "\\".

###### {

```
"results": [
{
"counters": [
{"count": 59, "lastUpdatedTimestamp": "1400769604813", "value": 23.0, "path": "/sport", "last
{"count": 64, "lastUpdatedTimestamp": "1400769604813", "value": 23.0, "path": "/", "lastUpdat
}
],
"objectsCount": 1,
"totalCount": 2,
"statusCode": 200,
"errorCode": 0,
"statusReason": "OK",
"callId": "7651"
}
```
####  Note

```
regExp queries may lower performance in some cases.
```

#### Match any character

The period "." is used to represent any character.

For string "abcde":

ab... # match

a.c.e # match

#### Match One-or-more

The plus sign "+" can be used to repeat the preceding shortest pattern once or more times.

For string "aaabbb":

a+b+ # match

aa+bb+ # match

a+.+ # match

aa+bbb+ # no match

#### Match Zero-or-more

The asterisk "*" can be used to match the preceding shortest pattern zero-or-more times.

For string "aaabbb":

a*b* # match

a*b*c* # match

.*bbb.* # match

aaa*bbb* # match

#### Match Zero-or-one

The question mark "?" makes the preceding shortest pattern optional. It matches zero or one times.

For string "aaabbb":

aaa?bbb? # match

aaaa?bbbb? # match

.....?.? # match

aa?bb? # no match

#### Match Min-to-max

Curly brackets "{}" can be used to specify a minimum and (optionally) a maximum number of times the preceding shortest pattern

can repeat.


The allowed forms are:

{5} # repeat exactly 5 times

{2,5} # repeat at least twice and at most 5 times

{2,} # repeat at least twice

For string "aaabbb":

a{3}b{3} # match

a{2,4}b{2,4} # match

a{2,}b{2,} # match

.{3}.{3} # match

a{4}b{4} # no match

a{4,6}b{4,6} # no match

a{4,}b{4,} # no match

#### Grouping

Parentheses "()" can be used to form sub-patterns.

The quantity operators listed above operate on the shortest previous pattern, which can be a group.

For string "ababab":

(ab)+ # match

ab(ab)+ # match

(..)+ # match

(...)+ # no match

(ab)* # match

abab(ab)? # match

ab(ab)? # no match

(ab){3} # match

(ab){1,2} # no match

#### Alternation

The pipe symbol "|" acts as an OR operator. The match will succeed if the pattern on either the left-hand side OR the right-hand

side matches.

The alternation applies to the longest pattern, not the shortest.


For string "aabb":

aabb|bbaa # match

aacc|bb # no match

aa(cc|bb) # match

a+|b+ # no match

a+b+|b+a+ # match

a+(b|c)+ # match

#### Character classes

Ranges of potential characters may be represented as character classes by enclosing them in square brackets "[]". A leading ^

negates the character class.

The allowed forms are:

[abc] # 'a' or 'b' or 'c'

[a-c] # 'a' or 'b' or 'c'

[-abc] # '-' or 'a' or 'b' or 'c'

[abc\-] # '-' or 'a' or 'b' or 'c'

[^a-c] # any character except 'a' or 'b' or 'c'

Note that the dash "-" indicates a range of characters, unless it is the rst character or if it is escaped with a backslash.

For string "abcd":

ab[cd]+ # match

[a-d]+ # match

[^a-d]+ # no match

## accounts.setAccountInfo REST

This method sets account data into a user's account. The method accepts a list of optional parameters each dening a eld/object

in the account. The parameters that are passed in the request modify the relevant elds, and the other elds remain unchanged.

## Description

####  Caution

```
Do not use this API to create new elds within your site schema, use accounts.setSchema for consistent results. Fields created
with setAccountInfo have their write permissions automatically set to serverOnly, and must be manually changed using
accounts.setSchema to clientModify if you want to access these elds via client-side Web SDK calls.
```

The properties listed on this page apply to full accounts, note that Lite accounts only have access to a subset of these properties.

For detailed information on Lite Accounts, see the Lite Registration documentation.

## Request URL

##### https://accounts.<data-center>/accounts.setAccountInfo

Where <data-center> is:

##### us1.gigya.com - For the US data center.

##### eu1.gigya.com - For the European data center.

##### au1.gigya.com - For the Australian data center.

##### eu2.gigya.com - For the European Azure data center.

##### cn1.sapcdm.cn - For the Chinese data center.

##### global.gigya.com - For all Global site groups.

If you are not sure of your site's data center, see Finding Your Data Center.

## Parameters

```
Required Name Type Description
```
```
UID* string The unique ID of the user for which to set account data. Use either this parameter or
```
```
* You are required to pass only one of the parameters either UID or regToken.
```
```
regToken** string The regToken returned from accounts.initRegistration, accounts.register, or account
registration process has not been nalized. Note that the regToken you receive from
valid for only one hour. Calls passing a regToken are handled as client-side calls by th
writeAccess permission of "server only" will be inaccessible.
```
```
** When passing regToken , the call must be made over HTTPS.
```
```
addLoginEmails string A comma-separated list of emails that should be added to the user's login identiers
purposes.
```
```
communications JSON
object
```
```
An object containing data regarding opt-in to communication topics for this user. For
Topics.
```
```
channel_topic - The combination of communication channel and communica
delimited by underscore (_) or a custom name congured by the user). Note t
already exist in the system.
```
```
status The subscription status can be:
```
```
optIn
```
```
optOut
```
```
When manually passing SMS subscription information for a user using this m
of each of these parameters.
```
```
optIn - the conditions for opt-in, containing the following elds set for the top
```
```
eld – can be any of the these:
```

Required Name Type Description

```
sourceApplication (string)
```
```
brand (string)
```
```
acceptanceLocation (string)
```
```
acceptanceEvent (string)
```
```
reason (string)
```
```
agentType (string)
```
```
frequency (string)
```
```
data1 (string)
```
```
data2 (string)
```
```
data3 (string)
```
```
Example:
```
```
userActionTimestamp – Optional. The time when the end user provided the o
in ISO 8601 format: yyyy-mm-dd-Thh:MM:ss.SSSZ (for example, 2021-03-05
different from the time when the response was registered in the system, for e
response in a third-party system, which was then imported to CDC, or during
userActionTimestamp is the time of the original consent operation performe
are accepted, not future dates.
```
```
conictHandling string How the server handles a "login identier exists" conict on a new account:
```
```
fail - (default) returns a "login identier exists" error.
```
```
saveProleAndFail - prole data is saved before returning error "OK with erro
```
```
customIdentiers string An object containing the list of custom user identiers to update for this user, structu
"Custom user ID"}.
```
```
Custom Identier name - the custom identier dened in the system (for exa
```
```
User’s custom ID.
```
```
To remove the custom user ID, pass ʻnull’.
```
```
When manually passing custom user IDs for a user using this method, you can create
user ID. For details, see Custom Login Identiers. You can do that on any site on any o
```
```
data JSON
object
```
```
An object containing custom data. Any data that you want to store regarding the user
object can be stored here.
```
```
{"news_Email": {
"status": "optIn" ,
"optIn" : {
"sourceApplication" : "web"
}
}
}
```
####  Note

```
This parameter will only take affect if the Link Account policy is not disabled. See th
details on setting the Link Account policy.
```

Required Name Type Description

```
Note that when using this parameter for users that already have custom data stored,
elds again. Just include the elds you want to change or add. For example, the follow
the user's custom data with the value "Suzuki Alto", or, if a "car" eld already exists, it
Alto". Any other elds in the custom data objects remain unchanged.
```
```
isActive Boolean This parameter allows disabling the account. This is only permitted when calling this
attempting to disable an account from a client SDK will return an error.
```
```
If an account's isActive state is false, a user attempting to log in will receive an 'Accou
is the site's Login Identier, the same email can not be used to create a new account.
```
```
isLockedOut Boolean This parameter has been deprecated. Use accounts.rba.unlock REST instead.
```
```
isVeried Boolean Indicates whether the account emails are veried.
```
```
*If you pass the value 'true', all the user's emails will be set as veried. Once an acco
immutable and can not be 'unveried' and any unveried email addresses in the ac
veried.
```
```
lang string The locale of the current interaction.
```
```
If the current call includes the user's consent status (the preferences object), and the
passed has more than one localized purpose, this parameter is required to specify th
gave their consent.
```
```
You can nd a list of supported language codes in Advanced Customizations and Loc
```
```
In the New Consent solution, if the lang parameter is not forwarded, and a default loc
then the default locale is used.
```
```
muteWebhooks Boolean When set to true, no webhooks are triggered by the API call. The default value is false
```
```
newPassword string The new password to replace the old one. Use this parameter with password. When p
securityAnswer parameters, the password parameter is required.
```
```
password string The old password to be changed. Use this parameter with newPassword.
```
```
phoneNumber string The phone number login identier, if the account uses Phone Number Login. The sup
formatting is E.164.
```
```
When using accounts.setAccountInfo, this parameter cannot be updated using client
```
```
{'car':'Suzuki Alto'}
```
####  Note

```
If this parameter is passed, then the method must be called using HTTPS.
```
```
When users reset their password with this method, they are logged out of al
which the call is made.
``` 

```
GRANT access on `surgical_history`, `medication_history` 
WHERE request.reason is `clinical treatment`

```