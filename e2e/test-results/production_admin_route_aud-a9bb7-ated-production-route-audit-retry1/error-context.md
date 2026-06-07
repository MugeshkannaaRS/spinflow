# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: production_admin_route_audit.spec.ts >> authenticated production route audit
- Location: tests/production_admin_route_audit.spec.ts:23:5

# Error details

```
Test timeout of 120000ms exceeded.
```

```
Error: page.goto: Test timeout of 120000ms exceeded.
Call log:
  - navigating to "https://spinflow-f.onrender.com/admin/users", waiting until "networkidle"

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - complementary [ref=e4]:
      - generic [ref=e5]:
        - link "S SpinFlow ERP Vendor" [ref=e7] [cursor=pointer]:
          - /url: /dashboard
          - generic [ref=e8]: S
          - generic [ref=e9]:
            - generic [ref=e10]: SpinFlow ERP
            - generic [ref=e11]: Vendor
        - navigation [ref=e12]:
          - generic [ref=e13]:
            - generic [ref=e14]: Overview
            - link "Dashboard" [ref=e15] [cursor=pointer]:
              - /url: /dashboard
              - img [ref=e16]
              - generic [ref=e21]: Dashboard
          - generic [ref=e22]:
            - generic [ref=e23]: Settings
            - link "Users & Roles" [ref=e24] [cursor=pointer]:
              - /url: /users
              - img [ref=e25]
              - generic [ref=e37]: Users & Roles
            - link "Audit Logs" [ref=e38] [cursor=pointer]:
              - /url: /audit
              - img [ref=e39]
              - generic [ref=e42]: Audit Logs
            - link "Admin Panel" [ref=e43] [cursor=pointer]:
              - /url: /admin
              - img [ref=e44]
              - generic [ref=e46]: Admin Panel
            - link "Column Config" [ref=e47] [cursor=pointer]:
              - /url: /admin/column-config
              - img [ref=e48]
              - generic [ref=e49]: Column Config
            - link "Billing" [ref=e50] [cursor=pointer]:
              - /url: /admin/billing
              - img [ref=e51]
              - generic [ref=e53]: Billing
          - generic [ref=e54]:
            - generic [ref=e55]: Company
            - link "Billing" [ref=e56] [cursor=pointer]:
              - /url: /company/billing
              - img [ref=e57]
              - generic [ref=e59]: Billing
        - generic [ref=e60]:
          - link "S superadmin SUPER ADMIN" [ref=e61] [cursor=pointer]:
            - /url: /profile
            - generic [ref=e62]: S
            - generic [ref=e63]:
              - generic [ref=e64]: superadmin
              - generic [ref=e65]: SUPER ADMIN
          - button "Logout" [ref=e66]:
            - img [ref=e67]
            - generic [ref=e70]: Logout
          - button "Collapse sidebar" [ref=e71]:
            - img [ref=e72]
    - generic [ref=e74]:
      - banner [ref=e75]:
        - generic [ref=e76]:
          - heading "Admin Panel" [level=1] [ref=e77]
          - paragraph [ref=e78]: System administration
        - generic [ref=e79]:
          - button "Notifications" [ref=e81]:
            - img [ref=e82]
          - generic [ref=e85]: SUPER ADMIN
          - button "User menu" [ref=e87]: S
      - main [ref=e88]:
        - generic [ref=e89]:
          - generic [ref=e90]:
            - generic [ref=e91]:
              - heading "User Management" [level=1] [ref=e92]
              - generic [ref=e94]: Select a company to manage users
            - generic [ref=e95]:
              - button "Global Search" [ref=e96] [cursor=pointer]:
                - img
                - text: Global Search
              - button "Create User" [ref=e97] [cursor=pointer]:
                - img
                - text: Create User
          - generic [ref=e98]:
            - generic [ref=e99]:
              - heading "Companies" [level=3] [ref=e101]:
                - img [ref=e102]
                - text: Companies
              - generic [ref=e109]:
                - button "Deccan Fibres 50 users 0 mills" [ref=e110] [cursor=pointer]:
                  - generic [ref=e111]: Deccan Fibres
                  - generic [ref=e112]:
                    - generic [ref=e113]: 50 users
                    - generic [ref=e114]: 0 mills
                - button "Srinivas Cotton Mills 50 users 0 mills" [ref=e115] [cursor=pointer]:
                  - generic [ref=e116]: Srinivas Cotton Mills
                  - generic [ref=e117]:
                    - generic [ref=e118]: 50 users
                    - generic [ref=e119]: 0 mills
                - button "Premier Spinners 50 users 0 mills" [ref=e120] [cursor=pointer]:
                  - generic [ref=e121]: Premier Spinners
                  - generic [ref=e122]:
                    - generic [ref=e123]: 50 users
                    - generic [ref=e124]: 0 mills
                - button "Palar Fibres 50 users 0 mills" [ref=e125] [cursor=pointer]:
                  - generic [ref=e126]: Palar Fibres
                  - generic [ref=e127]:
                    - generic [ref=e128]: 50 users
                    - generic [ref=e129]: 0 mills
                - button "Pennar Textiles 50 users 0 mills" [ref=e130] [cursor=pointer]:
                  - generic [ref=e131]: Pennar Textiles
                  - generic [ref=e132]:
                    - generic [ref=e133]: 50 users
                    - generic [ref=e134]: 0 mills
                - button "Cauvery Spinning 50 users 0 mills" [ref=e135] [cursor=pointer]:
                  - generic [ref=e136]: Cauvery Spinning
                  - generic [ref=e137]:
                    - generic [ref=e138]: 50 users
                    - generic [ref=e139]: 0 mills
                - button "Tungabhadra Mills 50 users 0 mills" [ref=e140] [cursor=pointer]:
                  - generic [ref=e141]: Tungabhadra Mills
                  - generic [ref=e142]:
                    - generic [ref=e143]: 50 users
                    - generic [ref=e144]: 0 mills
                - button "Narmada Synthetics 50 users 0 mills" [ref=e145] [cursor=pointer]:
                  - generic [ref=e146]: Narmada Synthetics
                  - generic [ref=e147]:
                    - generic [ref=e148]: 50 users
                    - generic [ref=e149]: 0 mills
                - button "Godavari Yarns 50 users 0 mills" [ref=e150] [cursor=pointer]:
                  - generic [ref=e151]: Godavari Yarns
                  - generic [ref=e152]:
                    - generic [ref=e153]: 50 users
                    - generic [ref=e154]: 0 mills
                - button "Kaveri Texports 50 users 0 mills" [ref=e155] [cursor=pointer]:
                  - generic [ref=e156]: Kaveri Texports
                  - generic [ref=e157]:
                    - generic [ref=e158]: 50 users
                    - generic [ref=e159]: 0 mills
                - button "Premier Spinners 0 users 0 mills" [ref=e160] [cursor=pointer]:
                  - generic [ref=e161]: Premier Spinners
                  - generic [ref=e162]:
                    - generic [ref=e163]: 0 users
                    - generic [ref=e164]: 0 mills
                - button "Palar Fibres 0 users 0 mills" [ref=e165] [cursor=pointer]:
                  - generic [ref=e166]: Palar Fibres
                  - generic [ref=e167]:
                    - generic [ref=e168]: 0 users
                    - generic [ref=e169]: 0 mills
                - button "Pennar Textiles 0 users 0 mills" [ref=e170] [cursor=pointer]:
                  - generic [ref=e171]: Pennar Textiles
                  - generic [ref=e172]:
                    - generic [ref=e173]: 0 users
                    - generic [ref=e174]: 0 mills
                - button "Cauvery Spinning 0 users 0 mills" [ref=e175] [cursor=pointer]:
                  - generic [ref=e176]: Cauvery Spinning
                  - generic [ref=e177]:
                    - generic [ref=e178]: 0 users
                    - generic [ref=e179]: 0 mills
                - button "Tungabhadra Mills 0 users 0 mills" [ref=e180] [cursor=pointer]:
                  - generic [ref=e181]: Tungabhadra Mills
                  - generic [ref=e182]:
                    - generic [ref=e183]: 0 users
                    - generic [ref=e184]: 0 mills
                - button "Narmada Synthetics 0 users 0 mills" [ref=e185] [cursor=pointer]:
                  - generic [ref=e186]: Narmada Synthetics
                  - generic [ref=e187]:
                    - generic [ref=e188]: 0 users
                    - generic [ref=e189]: 0 mills
                - button "Godavari Yarns 0 users 0 mills" [ref=e190] [cursor=pointer]:
                  - generic [ref=e191]: Godavari Yarns
                  - generic [ref=e192]:
                    - generic [ref=e193]: 0 users
                    - generic [ref=e194]: 0 mills
                - button "Kaveri Texports 0 users 0 mills" [ref=e195] [cursor=pointer]:
                  - generic [ref=e196]: Kaveri Texports
                  - generic [ref=e197]:
                    - generic [ref=e198]: 0 users
                    - generic [ref=e199]: 0 mills
                - button "Deccan Fibres 0 users 0 mills" [ref=e200] [cursor=pointer]:
                  - generic [ref=e201]: Deccan Fibres
                  - generic [ref=e202]:
                    - generic [ref=e203]: 0 users
                    - generic [ref=e204]: 0 mills
                - button "Srinivas Cotton Mills 0 users 0 mills" [ref=e205] [cursor=pointer]:
                  - generic [ref=e206]: Srinivas Cotton Mills
                  - generic [ref=e207]:
                    - generic [ref=e208]: 0 users
                    - generic [ref=e209]: 0 mills
                - button "Srinivas Cotton Mills 0 users 0 mills" [ref=e210] [cursor=pointer]:
                  - generic [ref=e211]: Srinivas Cotton Mills
                  - generic [ref=e212]:
                    - generic [ref=e213]: 0 users
                    - generic [ref=e214]: 0 mills
                - button "Palar Fibres 0 users 0 mills" [ref=e215] [cursor=pointer]:
                  - generic [ref=e216]: Palar Fibres
                  - generic [ref=e217]:
                    - generic [ref=e218]: 0 users
                    - generic [ref=e219]: 0 mills
                - button "Pennar Textiles 0 users 0 mills" [ref=e220] [cursor=pointer]:
                  - generic [ref=e221]: Pennar Textiles
                  - generic [ref=e222]:
                    - generic [ref=e223]: 0 users
                    - generic [ref=e224]: 0 mills
                - button "Cauvery Spinning 0 users 0 mills" [ref=e225] [cursor=pointer]:
                  - generic [ref=e226]: Cauvery Spinning
                  - generic [ref=e227]:
                    - generic [ref=e228]: 0 users
                    - generic [ref=e229]: 0 mills
                - button "Tungabhadra Mills 0 users 0 mills" [ref=e230] [cursor=pointer]:
                  - generic [ref=e231]: Tungabhadra Mills
                  - generic [ref=e232]:
                    - generic [ref=e233]: 0 users
                    - generic [ref=e234]: 0 mills
                - button "Narmada Synthetics 0 users 0 mills" [ref=e235] [cursor=pointer]:
                  - generic [ref=e236]: Narmada Synthetics
                  - generic [ref=e237]:
                    - generic [ref=e238]: 0 users
                    - generic [ref=e239]: 0 mills
                - button "Godavari Yarns 0 users 0 mills" [ref=e240] [cursor=pointer]:
                  - generic [ref=e241]: Godavari Yarns
                  - generic [ref=e242]:
                    - generic [ref=e243]: 0 users
                    - generic [ref=e244]: 0 mills
                - button "Kaveri Texports 0 users 0 mills" [ref=e245] [cursor=pointer]:
                  - generic [ref=e246]: Kaveri Texports
                  - generic [ref=e247]:
                    - generic [ref=e248]: 0 users
                    - generic [ref=e249]: 0 mills
                - button "Deccan Fibres 0 users 0 mills" [ref=e250] [cursor=pointer]:
                  - generic [ref=e251]: Deccan Fibres
                  - generic [ref=e252]:
                    - generic [ref=e253]: 0 users
                    - generic [ref=e254]: 0 mills
                - button "Premier Spinners 0 users 0 mills" [ref=e255] [cursor=pointer]:
                  - generic [ref=e256]: Premier Spinners
                  - generic [ref=e257]:
                    - generic [ref=e258]: 0 users
                    - generic [ref=e259]: 0 mills
                - button "Tungabhadra Mills 0 users 0 mills" [ref=e260] [cursor=pointer]:
                  - generic [ref=e261]: Tungabhadra Mills
                  - generic [ref=e262]:
                    - generic [ref=e263]: 0 users
                    - generic [ref=e264]: 0 mills
                - button "Cauvery Spinning 0 users 0 mills" [ref=e265] [cursor=pointer]:
                  - generic [ref=e266]: Cauvery Spinning
                  - generic [ref=e267]:
                    - generic [ref=e268]: 0 users
                    - generic [ref=e269]: 0 mills
                - button "Palar Fibres 0 users 0 mills" [ref=e270] [cursor=pointer]:
                  - generic [ref=e271]: Palar Fibres
                  - generic [ref=e272]:
                    - generic [ref=e273]: 0 users
                    - generic [ref=e274]: 0 mills
                - button "Premier Spinners 0 users 0 mills" [ref=e275] [cursor=pointer]:
                  - generic [ref=e276]: Premier Spinners
                  - generic [ref=e277]:
                    - generic [ref=e278]: 0 users
                    - generic [ref=e279]: 0 mills
                - button "Srinivas Cotton Mills 0 users 0 mills" [ref=e280] [cursor=pointer]:
                  - generic [ref=e281]: Srinivas Cotton Mills
                  - generic [ref=e282]:
                    - generic [ref=e283]: 0 users
                    - generic [ref=e284]: 0 mills
                - button "Deccan Fibres 0 users 0 mills" [ref=e285] [cursor=pointer]:
                  - generic [ref=e286]: Deccan Fibres
                  - generic [ref=e287]:
                    - generic [ref=e288]: 0 users
                    - generic [ref=e289]: 0 mills
                - button "Kaveri Texports 0 users 0 mills" [ref=e290] [cursor=pointer]:
                  - generic [ref=e291]: Kaveri Texports
                  - generic [ref=e292]:
                    - generic [ref=e293]: 0 users
                    - generic [ref=e294]: 0 mills
                - button "Godavari Yarns 0 users 0 mills" [ref=e295] [cursor=pointer]:
                  - generic [ref=e296]: Godavari Yarns
                  - generic [ref=e297]:
                    - generic [ref=e298]: 0 users
                    - generic [ref=e299]: 0 mills
                - button "Narmada Synthetics 0 users 0 mills" [ref=e300] [cursor=pointer]:
                  - generic [ref=e301]: Narmada Synthetics
                  - generic [ref=e302]:
                    - generic [ref=e303]: 0 users
                    - generic [ref=e304]: 0 mills
                - button "Pennar Textiles 0 users 0 mills" [ref=e305] [cursor=pointer]:
                  - generic [ref=e306]: Pennar Textiles
                  - generic [ref=e307]:
                    - generic [ref=e308]: 0 users
                    - generic [ref=e309]: 0 mills
                - button "Pennar Textiles 0 users 0 mills" [ref=e310] [cursor=pointer]:
                  - generic [ref=e311]: Pennar Textiles
                  - generic [ref=e312]:
                    - generic [ref=e313]: 0 users
                    - generic [ref=e314]: 0 mills
                - button "Premier Spinners 0 users 0 mills" [ref=e315] [cursor=pointer]:
                  - generic [ref=e316]: Premier Spinners
                  - generic [ref=e317]:
                    - generic [ref=e318]: 0 users
                    - generic [ref=e319]: 0 mills
                - button "Srinivas Cotton Mills 0 users 0 mills" [ref=e320] [cursor=pointer]:
                  - generic [ref=e321]: Srinivas Cotton Mills
                  - generic [ref=e322]:
                    - generic [ref=e323]: 0 users
                    - generic [ref=e324]: 0 mills
                - button "Deccan Fibres 0 users 0 mills" [ref=e325] [cursor=pointer]:
                  - generic [ref=e326]: Deccan Fibres
                  - generic [ref=e327]:
                    - generic [ref=e328]: 0 users
                    - generic [ref=e329]: 0 mills
                - button "Kaveri Texports 0 users 0 mills" [ref=e330] [cursor=pointer]:
                  - generic [ref=e331]: Kaveri Texports
                  - generic [ref=e332]:
                    - generic [ref=e333]: 0 users
                    - generic [ref=e334]: 0 mills
                - button "Godavari Yarns 0 users 0 mills" [ref=e335] [cursor=pointer]:
                  - generic [ref=e336]: Godavari Yarns
                  - generic [ref=e337]:
                    - generic [ref=e338]: 0 users
                    - generic [ref=e339]: 0 mills
                - button "Narmada Synthetics 0 users 0 mills" [ref=e340] [cursor=pointer]:
                  - generic [ref=e341]: Narmada Synthetics
                  - generic [ref=e342]:
                    - generic [ref=e343]: 0 users
                    - generic [ref=e344]: 0 mills
                - button "Tungabhadra Mills 0 users 0 mills" [ref=e345] [cursor=pointer]:
                  - generic [ref=e346]: Tungabhadra Mills
                  - generic [ref=e347]:
                    - generic [ref=e348]: 0 users
                    - generic [ref=e349]: 0 mills
                - button "Cauvery Spinning 0 users 0 mills" [ref=e350] [cursor=pointer]:
                  - generic [ref=e351]: Cauvery Spinning
                  - generic [ref=e352]:
                    - generic [ref=e353]: 0 users
                    - generic [ref=e354]: 0 mills
                - button "Palar Fibres 0 users 0 mills" [ref=e355] [cursor=pointer]:
                  - generic [ref=e356]: Palar Fibres
                  - generic [ref=e357]:
                    - generic [ref=e358]: 0 users
                    - generic [ref=e359]: 0 mills
                - button "Premier Spinners 0 users 0 mills" [ref=e360] [cursor=pointer]:
                  - generic [ref=e361]: Premier Spinners
                  - generic [ref=e362]:
                    - generic [ref=e363]: 0 users
                    - generic [ref=e364]: 0 mills
                - button "Palar Fibres 0 users 0 mills" [ref=e365] [cursor=pointer]:
                  - generic [ref=e366]: Palar Fibres
                  - generic [ref=e367]:
                    - generic [ref=e368]: 0 users
                    - generic [ref=e369]: 0 mills
                - button "Pennar Textiles 0 users 0 mills" [ref=e370] [cursor=pointer]:
                  - generic [ref=e371]: Pennar Textiles
                  - generic [ref=e372]:
                    - generic [ref=e373]: 0 users
                    - generic [ref=e374]: 0 mills
                - button "Cauvery Spinning 0 users 0 mills" [ref=e375] [cursor=pointer]:
                  - generic [ref=e376]: Cauvery Spinning
                  - generic [ref=e377]:
                    - generic [ref=e378]: 0 users
                    - generic [ref=e379]: 0 mills
                - button "Tungabhadra Mills 0 users 0 mills" [ref=e380] [cursor=pointer]:
                  - generic [ref=e381]: Tungabhadra Mills
                  - generic [ref=e382]:
                    - generic [ref=e383]: 0 users
                    - generic [ref=e384]: 0 mills
                - button "Narmada Synthetics 0 users 0 mills" [ref=e385] [cursor=pointer]:
                  - generic [ref=e386]: Narmada Synthetics
                  - generic [ref=e387]:
                    - generic [ref=e388]: 0 users
                    - generic [ref=e389]: 0 mills
                - button "Godavari Yarns 0 users 0 mills" [ref=e390] [cursor=pointer]:
                  - generic [ref=e391]: Godavari Yarns
                  - generic [ref=e392]:
                    - generic [ref=e393]: 0 users
                    - generic [ref=e394]: 0 mills
                - button "Kaveri Texports 0 users 0 mills" [ref=e395] [cursor=pointer]:
                  - generic [ref=e396]: Kaveri Texports
                  - generic [ref=e397]:
                    - generic [ref=e398]: 0 users
                    - generic [ref=e399]: 0 mills
                - button "Deccan Fibres 0 users 0 mills" [ref=e400] [cursor=pointer]:
                  - generic [ref=e401]: Deccan Fibres
                  - generic [ref=e402]:
                    - generic [ref=e403]: 0 users
                    - generic [ref=e404]: 0 mills
                - button "Srinivas Cotton Mills 0 users 0 mills" [ref=e405] [cursor=pointer]:
                  - generic [ref=e406]: Srinivas Cotton Mills
                  - generic [ref=e407]:
                    - generic [ref=e408]: 0 users
                    - generic [ref=e409]: 0 mills
                - button "Srinivas Cotton Mills 0 users 0 mills" [ref=e410] [cursor=pointer]:
                  - generic [ref=e411]: Srinivas Cotton Mills
                  - generic [ref=e412]:
                    - generic [ref=e413]: 0 users
                    - generic [ref=e414]: 0 mills
                - button "Palar Fibres 0 users 0 mills" [ref=e415] [cursor=pointer]:
                  - generic [ref=e416]: Palar Fibres
                  - generic [ref=e417]:
                    - generic [ref=e418]: 0 users
                    - generic [ref=e419]: 0 mills
                - button "Pennar Textiles 0 users 0 mills" [ref=e420] [cursor=pointer]:
                  - generic [ref=e421]: Pennar Textiles
                  - generic [ref=e422]:
                    - generic [ref=e423]: 0 users
                    - generic [ref=e424]: 0 mills
                - button "Cauvery Spinning 0 users 0 mills" [ref=e425] [cursor=pointer]:
                  - generic [ref=e426]: Cauvery Spinning
                  - generic [ref=e427]:
                    - generic [ref=e428]: 0 users
                    - generic [ref=e429]: 0 mills
                - button "Tungabhadra Mills 0 users 0 mills" [ref=e430] [cursor=pointer]:
                  - generic [ref=e431]: Tungabhadra Mills
                  - generic [ref=e432]:
                    - generic [ref=e433]: 0 users
                    - generic [ref=e434]: 0 mills
                - button "Narmada Synthetics 0 users 0 mills" [ref=e435] [cursor=pointer]:
                  - generic [ref=e436]: Narmada Synthetics
                  - generic [ref=e437]:
                    - generic [ref=e438]: 0 users
                    - generic [ref=e439]: 0 mills
                - button "Godavari Yarns 0 users 0 mills" [ref=e440] [cursor=pointer]:
                  - generic [ref=e441]: Godavari Yarns
                  - generic [ref=e442]:
                    - generic [ref=e443]: 0 users
                    - generic [ref=e444]: 0 mills
                - button "Kaveri Texports 0 users 0 mills" [ref=e445] [cursor=pointer]:
                  - generic [ref=e446]: Kaveri Texports
                  - generic [ref=e447]:
                    - generic [ref=e448]: 0 users
                    - generic [ref=e449]: 0 mills
                - button "Deccan Fibres 0 users 0 mills" [ref=e450] [cursor=pointer]:
                  - generic [ref=e451]: Deccan Fibres
                  - generic [ref=e452]:
                    - generic [ref=e453]: 0 users
                    - generic [ref=e454]: 0 mills
                - button "Premier Spinners 0 users 0 mills" [ref=e455] [cursor=pointer]:
                  - generic [ref=e456]: Premier Spinners
                  - generic [ref=e457]:
                    - generic [ref=e458]: 0 users
                    - generic [ref=e459]: 0 mills
                - button "spin 0 users 0 mills" [ref=e460] [cursor=pointer]:
                  - generic [ref=e461]: spin
                  - generic [ref=e462]:
                    - generic [ref=e463]: 0 users
                    - generic [ref=e464]: 0 mills
                - button "spin 0 users 0 mills" [ref=e465] [cursor=pointer]:
                  - generic [ref=e466]: spin
                  - generic [ref=e467]:
                    - generic [ref=e468]: 0 users
                    - generic [ref=e469]: 0 mills
                - button "AA 0 users 0 mills" [ref=e470] [cursor=pointer]:
                  - generic [ref=e471]: AA
                  - generic [ref=e472]:
                    - generic [ref=e473]: 0 users
                    - generic [ref=e474]: 0 mills
                - button "SpinFlow Textiles Pvt. Ltd. 0 users 0 mills" [ref=e475] [cursor=pointer]:
                  - generic [ref=e476]: SpinFlow Textiles Pvt. Ltd.
                  - generic [ref=e477]:
                    - generic [ref=e478]: 0 users
                    - generic [ref=e479]: 0 mills
            - generic [ref=e480]:
              - heading "Mills" [level=3] [ref=e482]:
                - img [ref=e483]
                - text: Mills
              - generic [ref=e488]:
                - img [ref=e489]
                - text: Select a company
            - generic [ref=e493]:
              - generic [ref=e494]:
                - generic [ref=e495]:
                  - heading "Users" [level=3] [ref=e496]:
                    - img [ref=e497]
                    - text: Users
                  - generic [ref=e502]: 500 of 500
                - generic [ref=e503]:
                  - img [ref=e504]
                  - combobox [ref=e506]:
                    - option "All Departments" [selected]
                    - option "Production"
                    - option "Quality"
                    - option "Dispatch"
                    - option "Stores"
                    - option "HR"
                    - option "Accounts"
                    - option "Maintenance"
                    - option "Purchase"
                    - option "Sales"
                    - option "Administration"
                  - combobox [ref=e507]:
                    - option "All Roles" [selected]
                    - option "Accountant"
                    - option "Auditor (Read-only)"
                    - option "Dispatch Manager"
                    - option "General Manager"
                    - option "HR Manager"
                    - option "Machine Operator"
                    - option "Maintenance Manager"
                    - option "Mill Owner"
                    - option "Production Manager"
                    - option "Quality Manager"
                    - option "Security Gate"
                    - option "Store Manager"
                    - option "Supervisor"
                    - option "Super Admin"
                  - combobox [ref=e508]:
                    - option "All Status" [selected]
                    - option "Active"
                    - option "Inactive"
              - generic [ref=e512]:
                - img [ref=e513]
                - paragraph [ref=e518]: Select a company and mill
                - paragraph [ref=e519]: Use the left panels to navigate the hierarchy
  - region "Notifications alt+T"
```

# Test source

```ts
  1  | import { test } from '@playwright/test';
  2  | import path from 'path';
  3  | import fs from 'fs';
  4  | import { loginAs } from './helpers';
  5  | 
  6  | const routes = [
  7  |   '/admin/companies',
  8  |   '/admin/users',
  9  |   '/admin/billing',
  10 |   '/admin/subscriptions',
  11 |   '/admin/audit',
  12 |   '/masters',
  13 |   '/hr',
  14 |   '/payroll',
  15 |   '/inventory',
  16 |   '/stores',
  17 |   '/dispatch',
  18 |   '/maintenance',
  19 |   '/quality',
  20 |   '/lotrac',
  21 | ];
  22 | 
  23 | test('authenticated production route audit', async ({ page }) => {
  24 |   await loginAs(page, 'super');
  25 | 
  26 |   const rootEvidence = path.resolve('e2e', 'prod-audit');
  27 |   fs.mkdirSync(rootEvidence, { recursive: true });
  28 | 
  29 |   for (const route of routes) {
  30 |     const sanitized = route.replace(/\//g, '_').replace(/^_/, '');
  31 |     const evidenceDir = path.join(rootEvidence, sanitized);
  32 |     fs.mkdirSync(evidenceDir, { recursive: true });
  33 | 
  34 |     const consoleMessages: Array<{ type: string; text: string }> = [];
  35 |     const pageErrors: Array<{ message: string; stack: string | null }> = [];
  36 |     const failedRequests: Array<{ url: string; method: string; failure: string | null }> = [];
  37 |     const responseErrors: Array<{ url: string; status: number; statusText: string; body: string }> = [];
  38 |     const networkRequests: Array<{ url: string; method: string; status: number | null; statusText: string | null }> = [];
  39 | 
  40 |     page.removeAllListeners('console');
  41 |     page.removeAllListeners('pageerror');
  42 |     page.removeAllListeners('requestfailed');
  43 |     page.removeAllListeners('response');
  44 | 
  45 |     page.on('console', (message) => {
  46 |       const type = message.type();
  47 |       if (type === 'error' || type === 'warning') {
  48 |         consoleMessages.push({ type, text: message.text() });
  49 |       }
  50 |     });
  51 |     page.on('pageerror', (error) => {
  52 |       pageErrors.push({ message: error.message, stack: error.stack ?? null });
  53 |     });
  54 |     page.on('requestfailed', (request) => {
  55 |       failedRequests.push({ url: request.url(), method: request.method(), failure: request.failure()?.errorText ?? null });
  56 |       networkRequests.push({ url: request.url(), method: request.method(), status: null, statusText: null });
  57 |     });
  58 |     page.on('response', async (response) => {
  59 |       const status = response.status();
  60 |       const url = response.url();
  61 |       networkRequests.push({ url, method: response.request().method(), status, statusText: response.statusText() });
  62 |       if (status >= 400) {
  63 |         let body = '';
  64 |         try {
  65 |           body = await response.text();
  66 |         } catch (e) {
  67 |           body = `<failed to read body: ${e}>`;
  68 |         }
  69 |         responseErrors.push({ url, status, statusText: response.statusText(), body });
  70 |       }
  71 |     });
  72 | 
> 73 |     await page.goto(route, { waitUntil: 'networkidle', timeout: 120_000 });
     |                ^ Error: page.goto: Test timeout of 120000ms exceeded.
  74 |     await page.waitForLoadState('networkidle', { timeout: 120_000 });
  75 | 
  76 |     const currentRoute = await page.evaluate(() => window.location.href);
  77 |     const pageTitle = await page.title();
  78 |     const html = await page.content();
  79 |     fs.writeFileSync(path.join(evidenceDir, 'route.txt'), currentRoute);
  80 |     fs.writeFileSync(path.join(evidenceDir, 'title.txt'), pageTitle);
  81 |     fs.writeFileSync(path.join(evidenceDir, 'page.html'), html);
  82 |     const screenshotPath = path.join(evidenceDir, 'screenshot.png');
  83 |     await page.screenshot({ path: screenshotPath, fullPage: true });
  84 | 
  85 |     if (consoleMessages.length) fs.writeFileSync(path.join(evidenceDir, 'console-errors.json'), JSON.stringify(consoleMessages, null, 2));
  86 |     if (pageErrors.length) fs.writeFileSync(path.join(evidenceDir, 'page-errors.json'), JSON.stringify(pageErrors, null, 2));
  87 |     if (failedRequests.length) fs.writeFileSync(path.join(evidenceDir, 'failed-requests.json'), JSON.stringify(failedRequests, null, 2));
  88 |     if (responseErrors.length) fs.writeFileSync(path.join(evidenceDir, 'response-errors.json'), JSON.stringify(responseErrors, null, 2));
  89 |     if (networkRequests.length) fs.writeFileSync(path.join(evidenceDir, 'network-requests.json'), JSON.stringify(networkRequests, null, 2));
  90 | 
  91 |     console.log(`${route}: title=${pageTitle} console=${consoleMessages.length} pageErrors=${pageErrors.length} failedRequests=${failedRequests.length} responseErrors=${responseErrors.length}`);
  92 |   }
  93 | });
  94 | 
```