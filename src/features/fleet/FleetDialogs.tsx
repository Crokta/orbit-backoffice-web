import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Checkbox, Field, Notice, PrefixedInput, Select, TextArea, TextInput } from '../../components/ui/Inputs'
import { TIERS, type Tier, describeFailure } from '../delivery/api'
import { fromInputValue, parseMoneyToMinor, parseWhole, toDateInputValue } from '../../lib/format'
import {
  type ConditionCheck,
  DAMAGE_SEVERITIES,
  type DamageSeverity,
  type Depot,
  type DepotInput,
  FUEL_LABEL,
  FUEL_LEVELS,
  type FleetVehicle,
  type FuelLevel,
  type NewVehicle,
  SEVERITY_LABEL,
  type VehiclePatch,
  type VehicleStatus,
  fleetApi,
  fleetKeys,
} from './api'

/** The depot dropdown three of these dialogs share. */
function DepotSelect({ id, value, onChange, allowBlank }: { readonly id: string; readonly value: string; readonly onChange: (value: string) => void; readonly allowBlank?: boolean }) {
  const depots = useQuery({ queryKey: fleetKeys.depots(), queryFn: fleetApi.depots })

  return (
    <Select id={id} value={value} onChange={(e) => { onChange(e.target.value) }} disabled={depots.isPending}>
      <option value="">{depots.isPending ? 'Loading depots…' : depots.isError ? 'Depots could not be loaded' : allowBlank === true ? 'No home depot' : 'Choose a depot'}</option>
      {(depots.data ?? []).map((depot) => (
        <option key={depot.depotId} value={depot.depotId}>{depot.name}</option>
      ))}
    </Select>
  )
}

/** "Register vehicle": an Orbit-owned vehicle joins the fleet at its home depot. */
export function RegisterVehicleDialog({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  const queryClient = useQueryClient()

  const [plate, setPlate] = useState('')
  const [tier, setTier] = useState<Tier>('Bike')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [colour, setColour] = useState('')
  const [year, setYear] = useState('')
  const [depotId, setDepotId] = useState('')
  const [mileage, setMileage] = useState('')
  const [nextService, setNextService] = useState('')
  const [insurance, setInsurance] = useState('')
  const [roadworthiness, setRoadworthiness] = useState('')

  const register = useMutation({
    mutationFn: (body: NewVehicle) => fleetApi.registerVehicle(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: fleetKeys.all })
      onClose()
    },
  })

  const mileageKm = parseWhole(mileage)
  const yearNumber = parseWhole(year)
  const canSubmit = plate.trim().length >= 3 && make.trim().length > 0 && model.trim().length > 0 && depotId.length > 0 && mileageKm !== undefined

  function submit() {
    if (mileageKm === undefined) {
      return
    }

    const nextServiceDue = fromInputValue(nextService)
    const insuranceExpiresAt = fromInputValue(insurance)
    const roadworthinessExpiresAt = fromInputValue(roadworthiness)

    register.mutate({
      plate: plate.trim().toUpperCase(),
      tier,
      make: make.trim(),
      model: model.trim(),
      ...(colour.trim().length > 0 ? { colour: colour.trim() } : {}),
      ...(yearNumber === undefined ? {} : { year: yearNumber }),
      homeDepotId: depotId,
      mileageKm,
      ...(nextServiceDue === undefined ? {} : { nextServiceDue }),
      ...(insuranceExpiresAt === undefined ? {} : { insuranceExpiresAt }),
      ...(roadworthinessExpiresAt === undefined ? {} : { roadworthinessExpiresAt }),
    })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Register vehicle"
      subtitle="An Orbit-owned vehicle. Its tier is what dispatch offers it, once a courier has it."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={register.isPending} disabled={!canSubmit}>Register</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <Field label="Registration plate" htmlFor="rv-plate">
          <TextInput id="rv-plate" value={plate} onChange={(e) => { setPlate(e.target.value) }} placeholder="LND-482-KJA" autoFocus autoComplete="off" />
        </Field>
        <Field label="Tier" htmlFor="rv-tier">
          <Select id="rv-tier" value={tier} onChange={(e) => { setTier(e.target.value as Tier) }}>
            {TIERS.map((option) => <option key={option} value={option}>{option}</option>)}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Make" htmlFor="rv-make"><TextInput id="rv-make" value={make} onChange={(e) => { setMake(e.target.value) }} placeholder="Bajaj" /></Field>
        <Field label="Model" htmlFor="rv-model"><TextInput id="rv-model" value={model} onChange={(e) => { setModel(e.target.value) }} placeholder="Boxer 150" /></Field>
        <Field label="Colour" htmlFor="rv-colour"><TextInput id="rv-colour" value={colour} onChange={(e) => { setColour(e.target.value) }} placeholder="Orange" /></Field>
        <Field label="Year" htmlFor="rv-year"><TextInput id="rv-year" inputMode="numeric" value={year} onChange={(e) => { setYear(e.target.value) }} placeholder="2025" /></Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Home depot" htmlFor="rv-depot"><DepotSelect id="rv-depot" value={depotId} onChange={setDepotId} /></Field>
        <Field label="Mileage (km)" htmlFor="rv-mileage" error={mileage.length > 0 && mileageKm === undefined ? 'Whole kilometres.' : undefined}>
          <TextInput id="rv-mileage" inputMode="numeric" value={mileage} onChange={(e) => { setMileage(e.target.value) }} placeholder="12400" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Next service due" htmlFor="rv-service"><TextInput id="rv-service" type="date" value={nextService} onChange={(e) => { setNextService(e.target.value) }} /></Field>
        <Field label="Insurance expires" htmlFor="rv-insurance"><TextInput id="rv-insurance" type="date" value={insurance} onChange={(e) => { setInsurance(e.target.value) }} /></Field>
        <Field label="Roadworthiness expires" htmlFor="rv-rw"><TextInput id="rv-rw" type="date" value={roadworthiness} onChange={(e) => { setRoadworthiness(e.target.value) }} /></Field>
      </div>

      <Notice tone="info">A vehicle with lapsed insurance or roadworthiness is not road-legal and will not be offered jobs, whatever its status says.</Notice>

      {register.isError && <Notice tone="danger">{describeFailure(register.error, 'The vehicle could not be registered.')}</Notice>}
    </Dialog>
  )
}

/** "Edit vehicle": depot, mileage, next service and status. Assignment is a separate act. */
export function EditVehicleDialog({ vehicle, open, onClose }: { readonly vehicle: FleetVehicle; readonly open: boolean; readonly onClose: () => void }) {
  const queryClient = useQueryClient()

  const [depotId, setDepotId] = useState(vehicle.homeDepotId ?? '')
  const [mileage, setMileage] = useState(String(vehicle.mileageKm))
  const [nextService, setNextService] = useState(toDateInputValue(vehicle.nextServiceDue))
  const [insurance, setInsurance] = useState(toDateInputValue(vehicle.insuranceExpiresAt))
  const [roadworthiness, setRoadworthiness] = useState(toDateInputValue(vehicle.roadworthinessExpiresAt))
  const [status, setStatus] = useState<Exclude<VehicleStatus, 'assigned'>>(vehicle.status === 'assigned' ? 'available' : vehicle.status)

  const update = useMutation({
    mutationFn: (body: VehiclePatch) => fleetApi.updateVehicle(vehicle.vehicleId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: fleetKeys.all })
      onClose()
    },
  })

  const mileageKm = parseWhole(mileage)

  function submit() {
    const nextServiceDue = fromInputValue(nextService)
    const insuranceExpiresAt = fromInputValue(insurance)
    const roadworthinessExpiresAt = fromInputValue(roadworthiness)

    update.mutate({
      ...(depotId.length > 0 && depotId !== vehicle.homeDepotId ? { homeDepotId: depotId } : {}),
      ...(mileageKm !== undefined && mileageKm !== vehicle.mileageKm ? { mileageKm } : {}),
      ...(nextServiceDue === undefined ? {} : { nextServiceDue }),
      ...(insuranceExpiresAt === undefined ? {} : { insuranceExpiresAt }),
      ...(roadworthinessExpiresAt === undefined ? {} : { roadworthinessExpiresAt }),
      ...(vehicle.status === 'assigned' || status === vehicle.status ? {} : { status }),
    })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Edit ${vehicle.plate}`}
      subtitle={vehicle.status === 'assigned' ? 'On shift. Its status changes when the courier returns it.' : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={update.isPending} disabled={mileageKm === undefined}>Save</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Home depot" htmlFor="ev-depot"><DepotSelect id="ev-depot" value={depotId} onChange={setDepotId} allowBlank /></Field>
        <Field label="Status" htmlFor="ev-status">
          <Select id="ev-status" value={status} onChange={(e) => { setStatus(e.target.value as Exclude<VehicleStatus, 'assigned'>) }} disabled={vehicle.status === 'assigned'}>
            <option value="available">Available</option>
            <option value="maintenance">In maintenance</option>
            <option value="retired">Retired</option>
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mileage (km)" htmlFor="ev-mileage" error={mileageKm === undefined ? 'Whole kilometres.' : undefined}>
          <TextInput id="ev-mileage" inputMode="numeric" value={mileage} onChange={(e) => { setMileage(e.target.value) }} />
        </Field>
        <Field label="Next service due" htmlFor="ev-service"><TextInput id="ev-service" type="date" value={nextService} onChange={(e) => { setNextService(e.target.value) }} /></Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Insurance expires" htmlFor="ev-insurance"><TextInput id="ev-insurance" type="date" value={insurance} onChange={(e) => { setInsurance(e.target.value) }} /></Field>
        <Field label="Roadworthiness expires" htmlFor="ev-rw"><TextInput id="ev-rw" type="date" value={roadworthiness} onChange={(e) => { setRoadworthiness(e.target.value) }} /></Field>
      </div>

      {update.isError && <Notice tone="danger">{describeFailure(update.error, 'The vehicle could not be updated.')}</Notice>}
    </Dialog>
  )
}

/**
 * The condition check recorded at both ends of a shift (REQ124).
 *
 * The same six facts going out and coming in, so the difference between them is the shift.
 */
function ConditionCheckFields({
  prefix,
  value,
  onChange,
  mileageError,
}: {
  readonly prefix: string
  readonly value: CheckDraft
  readonly onChange: (next: CheckDraft) => void
  readonly mileageError: string | undefined
}) {
  const set = <K extends keyof CheckDraft>(key: K, next: CheckDraft[K]) => { onChange({ ...value, [key]: next }) }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mileage (km)" htmlFor={`${prefix}-mileage`} error={mileageError}>
          <TextInput id={`${prefix}-mileage`} inputMode="numeric" value={value.mileage} onChange={(e) => { set('mileage', e.target.value) }} placeholder="12400" />
        </Field>
        <Field label="Fuel level" htmlFor={`${prefix}-fuel`}>
          <Select id={`${prefix}-fuel`} value={value.fuelLevel} onChange={(e) => { set('fuelLevel', e.target.value as FuelLevel) }}>
            {FUEL_LEVELS.map((level) => <option key={level} value={level}>{FUEL_LABEL[level]}</option>)}
          </Select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Checkbox checked={value.lightsOk} onChange={(checked) => { set('lightsOk', checked) }} label="Lights working" />
        <Checkbox checked={value.tyresOk} onChange={(checked) => { set('tyresOk', checked) }} label="Tyres sound" />
        <Checkbox checked={value.bodyworkOk} onChange={(checked) => { set('bodyworkOk', checked) }} label="Bodywork undamaged" />
        <Checkbox checked={value.loadAreaClean} onChange={(checked) => { set('loadAreaClean', checked) }} label="Load area clean" />
      </div>

      <Field label="Notes" htmlFor={`${prefix}-notes`} hint="Anything the boxes above do not say: a scratch, a warning light, a missing strap.">
        <TextArea id={`${prefix}-notes`} value={value.notes} onChange={(e) => { set('notes', e.target.value) }} placeholder="Small dent on the left pannier, already there." />
      </Field>
    </>
  )
}

interface CheckDraft {
  readonly mileage: string
  readonly fuelLevel: FuelLevel
  readonly lightsOk: boolean
  readonly tyresOk: boolean
  readonly bodyworkOk: boolean
  readonly loadAreaClean: boolean
  readonly notes: string
}

function emptyCheck(mileageKm: number): CheckDraft {
  return { mileage: String(mileageKm), fuelLevel: 'full', lightsOk: true, tyresOk: true, bodyworkOk: true, loadAreaClean: true, notes: '' }
}

function toConditionCheck(draft: CheckDraft, mileageKm: number): ConditionCheck {
  return {
    mileageKm,
    fuelLevel: draft.fuelLevel,
    lightsOk: draft.lightsOk,
    tyresOk: draft.tyresOk,
    bodyworkOk: draft.bodyworkOk,
    loadAreaClean: draft.loadAreaClean,
    notes: draft.notes.trim(),
  }
}

/** The default due-back: eight hours from now, to the minute, in the input's local format. */
function defaultDueBack(): string {
  const due = new Date(Date.now() + 8 * 3_600_000)
  const pad = (n: number) => String(n).padStart(2, '0')

  return `${String(due.getFullYear())}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}T${pad(due.getHours())}:${pad(due.getMinutes())}`
}

/**
 * "Assign to courier": a courier takes the vehicle for a shift (REQ124).
 *
 * The check-out is recorded with it — the mileage and condition it left in are what a
 * damage report at the other end is measured against. The due-back time is what REQ044
 * uses to stop dispatch offering a job that ends past it.
 */
export function AssignVehicleDialog({ vehicle, open, onClose }: { readonly vehicle: FleetVehicle; readonly open: boolean; readonly onClose: () => void }) {
  const queryClient = useQueryClient()

  const [courierId, setCourierId] = useState('')
  const [dueBack, setDueBack] = useState(defaultDueBack)
  const [check, setCheck] = useState<CheckDraft>(() => emptyCheck(vehicle.mileageKm))

  const assign = useMutation({
    mutationFn: (body: { readonly courierId: string; readonly dueBackAt: string; readonly checkOut: ConditionCheck }) => fleetApi.assign(vehicle.vehicleId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: fleetKeys.all })
      onClose()
    },
  })

  const mileageKm = parseWhole(check.mileage)
  const dueBackAt = fromInputValue(dueBack)
  const mileageError = mileageKm === undefined ? 'Whole kilometres.' : mileageKm < vehicle.mileageKm ? `Below the ${String(vehicle.mileageKm)} km on record.` : undefined
  const canSubmit = courierId.trim().length > 0 && dueBackAt !== undefined && mileageKm !== undefined && mileageError === undefined

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Assign ${vehicle.plate} to a courier`}
      subtitle={`${vehicle.tier} · ${vehicle.make} ${vehicle.model}${vehicle.homeDepotName === null ? '' : ` · ${vehicle.homeDepotName}`}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => { if (mileageKm !== undefined && dueBackAt !== undefined) { assign.mutate({ courierId: courierId.trim(), dueBackAt, checkOut: toConditionCheck(check, mileageKm) }) } }}
            loading={assign.isPending}
            disabled={!canSubmit}
          >
            Assign and start shift
          </Button>
        </>
      }
    >
      {!vehicle.isRoadLegal && <Notice tone="danger" title="Not road-legal">Insurance or roadworthiness has lapsed. It can be assigned, but dispatch will not offer it jobs.</Notice>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Courier id" htmlFor="av-courier" hint="From the driver's profile. Their tier becomes this vehicle's.">
          <TextInput id="av-courier" value={courierId} onChange={(e) => { setCourierId(e.target.value) }} placeholder="drv_01J…" autoFocus autoComplete="off" />
        </Field>
        <Field label="Due back" htmlFor="av-due" error={dueBackAt === undefined ? 'When the shift ends.' : undefined}>
          <TextInput id="av-due" type="datetime-local" value={dueBack} onChange={(e) => { setDueBack(e.target.value) }} />
        </Field>
      </div>

      <p className="pt-1 text-[13px] font-semibold">Check-out condition</p>
      <ConditionCheckFields prefix="av" value={check} onChange={setCheck} mileageError={mileageError} />

      {assign.isError && <Notice tone="danger">{describeFailure(assign.error, 'The assignment was refused.')}</Notice>}
    </Dialog>
  )
}

/** "Return": the courier brings it back, and the check-in says in what state (REQ124). */
export function ReturnVehicleDialog({ vehicle, open, onClose }: { readonly vehicle: FleetVehicle; readonly open: boolean; readonly onClose: () => void }) {
  const queryClient = useQueryClient()
  const [check, setCheck] = useState<CheckDraft>(() => emptyCheck(vehicle.mileageKm))

  const returnVehicle = useMutation({
    mutationFn: (checkIn: ConditionCheck) => {
      if (vehicle.currentAssignmentId === null) {
        return Promise.reject(new Error('This vehicle is not on a shift.'))
      }

      return fleetApi.returnVehicle(vehicle.currentAssignmentId, { checkIn })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: fleetKeys.all })
      onClose()
    },
  })

  const mileageKm = parseWhole(check.mileage)
  const mileageError = mileageKm === undefined ? 'Whole kilometres.' : mileageKm < vehicle.mileageKm ? `Below the ${String(vehicle.mileageKm)} km it left with.` : undefined
  const flagged = !check.lightsOk || !check.tyresOk || !check.bodyworkOk || !check.loadAreaClean

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Return ${vehicle.plate}`}
      subtitle={`From ${vehicle.currentCourierName ?? vehicle.currentCourierId ?? 'its courier'}. The vehicle becomes available again.`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => { if (mileageKm !== undefined) { returnVehicle.mutate(toConditionCheck(check, mileageKm)) } }}
            loading={returnVehicle.isPending}
            disabled={mileageKm === undefined || mileageError !== undefined}
          >
            Record return
          </Button>
        </>
      }
    >
      <p className="text-[13px] font-semibold">Check-in condition</p>
      <ConditionCheckFields prefix="rv" value={check} onChange={setCheck} mileageError={mileageError} />

      {flagged && <Notice tone="warning">Something is not right. Record the return, then report the damage against this shift so it is on the courier's record.</Notice>}

      {returnVehicle.isError && <Notice tone="danger">{describeFailure(returnVehicle.error, 'The return was refused.')}</Notice>}
    </Dialog>
  )
}

/** "Report damage": against a specific courier and shift, never just against the vehicle (REQ124). */
export function ReportDamageDialog({
  assignmentId,
  plate,
  courierName,
  open,
  onClose,
}: {
  readonly assignmentId: string
  readonly plate: string
  readonly courierName: string | null
  readonly open: boolean
  readonly onClose: () => void
}) {
  const queryClient = useQueryClient()

  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<DamageSeverity>('minor')
  const [cost, setCost] = useState('')

  const estimatedCostMinor = parseMoneyToMinor(cost)

  const report = useMutation({
    mutationFn: () => fleetApi.reportDamage(assignmentId, { description: description.trim(), severity, estimatedCostMinor: estimatedCostMinor ?? 0 }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: fleetKeys.all })
      setDescription('')
      setCost('')
      onClose()
    },
  })

  const canSubmit = description.trim().length >= 10 && estimatedCostMinor !== undefined

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Report damage to ${plate}`}
      subtitle={`Recorded against ${courierName ?? 'the courier'} and this shift. The cost is itemised on their next payout if it is charged.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={() => { report.mutate() }} loading={report.isPending} disabled={!canSubmit}>Report damage</Button>
        </>
      }
    >
      <Field label="What is damaged (required)" htmlFor="rd-desc" hint={description.trim().length < 10 ? `${String(10 - description.trim().length)} more characters needed` : undefined}>
        <TextArea id="rd-desc" value={description} onChange={(e) => { setDescription(e.target.value) }} placeholder="Rear light cluster cracked; left mirror missing." />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Severity" htmlFor="rd-severity">
          <Select id="rd-severity" value={severity} onChange={(e) => { setSeverity(e.target.value as DamageSeverity) }}>
            {DAMAGE_SEVERITIES.map((option) => <option key={option} value={option}>{SEVERITY_LABEL[option]}</option>)}
          </Select>
        </Field>
        <Field label="Estimated cost" htmlFor="rd-cost" error={cost.length > 0 && estimatedCostMinor === undefined ? 'Not a number.' : undefined}>
          <PrefixedInput id="rd-cost" prefix="₦" inputMode="decimal" value={cost} onChange={(e) => { setCost(e.target.value) }} placeholder="25,000" />
        </Field>
      </div>

      {severity === 'unroadworthy' && <Notice tone="warning">The vehicle is taken off the road on saving. Move it to maintenance once it is back at the depot.</Notice>}

      {report.isError && <Notice tone="danger">{describeFailure(report.error, 'The report could not be saved.')}</Notice>}
    </Dialog>
  )
}

/** Add or edit a depot (REQ128). Items physically held there are on the exceptions queue. */
export function DepotDialog({ depot, open, onClose }: { readonly depot: Depot | null; readonly open: boolean; readonly onClose: () => void }) {
  const queryClient = useQueryClient()

  const [name, setName] = useState(depot?.name ?? '')
  const [address, setAddress] = useState(depot?.address ?? '')
  const [lat, setLat] = useState(depot === null ? '' : String(depot.lat))
  const [lng, setLng] = useState(depot === null ? '' : String(depot.lng))
  const [zoneId, setZoneId] = useState(depot?.zoneId ?? '')
  const [isActive, setIsActive] = useState(depot?.isActive ?? true)

  const save = useMutation({
    mutationFn: (body: DepotInput) => (depot === null ? fleetApi.createDepot(body) : fleetApi.updateDepot(depot.depotId, body)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: fleetKeys.depots() })
      onClose()
    },
  })

  const latNumber = Number.parseFloat(lat)
  const lngNumber = Number.parseFloat(lng)
  const coordsOk = Number.isFinite(latNumber) && Number.isFinite(lngNumber) && Math.abs(latNumber) <= 90 && Math.abs(lngNumber) <= 180
  const canSubmit = name.trim().length > 1 && address.trim().length > 3 && coordsOk

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={depot === null ? 'Add depot' : `Edit ${depot.name}`}
      subtitle="Where returned and held items sit, and where fleet vehicles go home to."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              save.mutate({
                name: name.trim(),
                address: address.trim(),
                lat: latNumber,
                lng: lngNumber,
                ...(zoneId.trim().length > 0 ? { zoneId: zoneId.trim() } : {}),
                isActive,
              })
            }}
            loading={save.isPending}
            disabled={!canSubmit}
          >
            {depot === null ? 'Add depot' : 'Save'}
          </Button>
        </>
      }
    >
      <Field label="Name" htmlFor="dp-name">
        <TextInput id="dp-name" value={name} onChange={(e) => { setName(e.target.value) }} placeholder="Ikeja depot" autoFocus />
      </Field>
      <Field label="Address" htmlFor="dp-address">
        <TextInput id="dp-address" value={address} onChange={(e) => { setAddress(e.target.value) }} placeholder="14 Oba Akran Avenue, Ikeja, Lagos" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Latitude" htmlFor="dp-lat" error={lat.length > 0 && !Number.isFinite(latNumber) ? 'Decimal degrees.' : undefined}>
          <TextInput id="dp-lat" inputMode="decimal" value={lat} onChange={(e) => { setLat(e.target.value) }} placeholder="6.6018" />
        </Field>
        <Field label="Longitude" htmlFor="dp-lng" error={lng.length > 0 && !Number.isFinite(lngNumber) ? 'Decimal degrees.' : undefined}>
          <TextInput id="dp-lng" inputMode="decimal" value={lng} onChange={(e) => { setLng(e.target.value) }} placeholder="3.3515" />
        </Field>
        <Field label="Zone id" htmlFor="dp-zone">
          <TextInput id="dp-zone" value={zoneId} onChange={(e) => { setZoneId(e.target.value) }} placeholder="lagos-ikeja" />
        </Field>
      </div>
      <Checkbox checked={isActive} onChange={setIsActive} label="Active" description="Inactive depots keep their history but cannot receive items or vehicles." />

      {save.isError && <Notice tone="danger">{describeFailure(save.error, 'The depot could not be saved.')}</Notice>}
    </Dialog>
  )
}
